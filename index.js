const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());

// Rota de status (deve vir antes do proxy)
app.get('/status', (req, res) => res.send('🍪 Session Proxy Online (v6.0)'));

// Middleware para salvar o alvo no cookie
app.use((req, res, next) => {
    const urlQuery = req.query.url;
    if (urlQuery) {
        let target = urlQuery;
        if (!target.startsWith('http')) target = 'https://' + target;
        
        // Salva apenas a ORIGEM (ex: https://www.google.com) no cookie
        try {
            const urlObj = new URL(target);
            res.cookie('proxy_target', urlObj.origin, { 
                maxAge: 900000, // 15 minutos
                httpOnly: false,
                secure: true,
                sameSite: 'none'
            });
        } catch(e) {}
    }
    next();
});

// A ROTA MÁGICA (Coringa)
// Captura qualquer coisa: /search, /assets, /login, /proxy
const proxyOptions = {
    target: 'https://www.google.com', // Alvo padrão (placeholder)
    changeOrigin: true,
    ws: true,
    router: (req) => {
        // 1. Prioridade: URL na query string (?url=...)
        if (req.query.url) {
            let url = req.query.url;
            if (!url.startsWith('http')) url = 'https://' + url;
            return url; // Usa a URL completa fornecida
        }
        
        // 2. Prioridade: Cookie da sessão anterior
        if (req.cookies.proxy_target) {
            return req.cookies.proxy_target;
        }

        // 3. Fallback (se não tiver nada, joga erro ou manda pro Google)
        return 'https://www.google.com'; 
    },
    pathRewrite: (path, req) => {
        // Se a requisição veio com ?url=..., removemos o caminho original para acessar a raiz do site
        if (req.query.url) return '/';
        return path; // Se for navegação interna (/search), mantém o path
    },
    onProxyRes: (proxyRes, req, res) => {
        const badHeaders = ['x-frame-options', 'content-security-policy', 'frame-options'];
        badHeaders.forEach(h => delete proxyRes.headers[h]);
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    },
    onError: (err, req, res) => {
        if (!res.headersSent) res.send(`Erro (Tente recarregar com a URL original): ${err.message}`);
    }
};

// Aplica o proxy na raiz "/" para pegar tudo
app.use('/', createProxyMiddleware(proxyOptions));

app.listen(PORT, () => console.log(`🍪 Session Proxy rodando na porta ${PORT}`));
