const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());

app.get('/status', (req, res) => res.send('✅ Navigator Smart Proxy (v10.0)'));

// 1. Middleware de Memória (Cookies)
app.use((req, res, next) => {
    const urlQuery = req.query.url;
    // Se o usuário mandou uma nova URL explícita (?url=...), atualizamos o cookie
    if (urlQuery) {
        let target = urlQuery;
        if (!target.startsWith('http')) target = 'https://' + target;
        try {
            const urlObj = new URL(target);
            // Salva a origem (ex: https://www.google.com)
            res.cookie('proxy_target', urlObj.origin, { 
                maxAge: 3600000, // 1 hora de memória
                httpOnly: false, 
                secure: true, 
                sameSite: 'none' 
            });
            // Adicionamos ao request para uso imediato
            req.targetOrigin = urlObj.origin;
        } catch(e) {}
    } else {
        // Se é uma navegação interna (clique em link), recupera da memória
        req.targetOrigin = req.cookies.proxy_target;
    }
    next();
});

// 2. Configuração do Proxy Inteligente
const proxyOptions = {
    target: 'https://www.google.com', // Fallback apenas
    changeOrigin: true,
    ws: true, 
    followRedirects: true,
    cookieDomainRewrite: { "*": "" }, // Tenta consertar cookies de login
    
    // O Roteador Dinâmico: Aqui corrigimos a "Tela Branca"
    router: (req) => {
        // Se temos um alvo na memória (cookie ou url atual), usamos ele
        if (req.targetOrigin) {
            return req.targetOrigin;
        }
        return 'https://www.google.com';
    },

    // Reescreve o caminho
    pathRewrite: (path, req) => {
        // Se veio com ?url=..., acessamos a raiz do site alvo
        if (req.query.url) return '/';
        // Se não, mantemos o caminho do clique (ex: /search?q=teste)
        return path;
    },

    // Headers fixos para evitar o erro ERR_HTTP_HEADERS_SENT
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'X-Frame-Options': '' 
    },

    onProxyRes: (proxyRes, req, res) => {
        // Remove travas de segurança
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
        // Evita crash do servidor em erros de rede
        if (!res.headersSent) res.status(500).send(`Erro Proxy: ${err.code}`);
    }
};

// Captura TODAS as requisições que não sejam /status
app.use('/', createProxyMiddleware(proxyOptions));

app.listen(PORT, () => console.log(`🚀 Smart Proxy rodando na porta ${PORT}`));
