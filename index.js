const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());

app.get('/status', (req, res) => res.send('✅ Navigator Smart Proxy v10 (Stable)'));

// 1. Middleware de "Memória" (Cookies)
// Antes de fazer o proxy, verificamos se o usuário está mudando de site
app.use((req, res, next) => {
    const urlQuery = req.query.url;
    
    // Se o usuário mandou ?url=..., ele quer trocar de site. Atualizamos a memória.
    if (urlQuery) {
        let target = urlQuery;
        if (!target.startsWith('http')) target = 'https://' + target;
        try {
            const urlObj = new URL(target);
            // Salva a origem (ex: https://www.google.com) no cookie
            res.cookie('proxy_target', urlObj.origin, { 
                maxAge: 3600000, // Lembra por 1 hora
                httpOnly: false, 
                secure: true, 
                sameSite: 'none' 
            });
            // Injeta no request para uso imediato
            req.targetOrigin = urlObj.origin;
        } catch(e) {}
    } else {
        // Se não tem ?url=, é uma navegação interna (clique ou busca). Recupera da memória.
        req.targetOrigin = req.cookies.proxy_target;
    }
    next();
});

// 2. Configuração do Proxy Inteligente
const proxyOptions = {
    target: 'https://www.google.com', // Alvo padrão (fallback)
    changeOrigin: true,
    ws: true, // Suporte a WebSockets
    followRedirects: true,
    cookieDomainRewrite: { "*": "" }, // Tenta manter login
    
    // O ROTEADOR MÁGICO: Resolve o problema da Tela Branca
    router: (req) => {
        // Se temos um alvo na memória (cookie ou url atual), usamos ele
        if (req.targetOrigin) {
            return req.targetOrigin;
        }
        return 'https://www.google.com';
    },

    // Corrige o caminho
    pathRewrite: (path, req) => {
        // Se veio com ?url=..., acessamos a raiz do site alvo (limpa a query do proxy)
        if (req.query.url) return '/';
        // Se não, mantemos o caminho do clique (ex: /search?q=teste vai para google.com/search?q=teste)
        return path;
    },

    // Headers estáticos para evitar crashes
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'X-Frame-Options': '' 
    },

    onProxyRes: (proxyRes, req, res) => {
        // Remove as travas de segurança
        const headersToDelete = [
            'x-frame-options', 
            'content-security-policy', 
            'frame-options', 
            'content-security-policy-report-only'
        ];
        headersToDelete.forEach(h => delete proxyRes.headers[h]);

        // Permite iframe
        proxyRes.headers['access-control-allow-origin'] = '*';
        proxyRes.headers['access-control-allow-credentials'] = 'true';
    },

    onError: (err, req, res) => {
        // Evita crash 503 se a conexão falhar
        if (!res.headersSent) res.status(500).send(`Erro Proxy: ${err.code}`);
    }
};

// Captura TODAS as requisições (Raiz e Subcaminhos)
app.use('/', createProxyMiddleware(proxyOptions));

app.listen(PORT, () => console.log(`🚀 Smart Proxy rodando na porta ${PORT}`));
