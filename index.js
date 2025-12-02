const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());

app.get('/status', (req, res) => res.send('✅ Navigator Stable Core (v9.0)'));

// Middleware de Sessão
app.use((req, res, next) => {
    const urlQuery = req.query.url;
    if (urlQuery) {
        let target = urlQuery;
        if (!target.startsWith('http')) target = 'https://' + target;
        try {
            const urlObj = new URL(target);
            res.cookie('proxy_target', urlObj.origin, { 
                maxAge: 900000, httpOnly: false, secure: true, sameSite: 'none' 
            });
        } catch(e) {}
    }
    next();
});

const proxyOptions = {
    target: 'https://www.google.com',
    changeOrigin: true,
    ws: true, 
    followRedirects: true, // Mantemos isso pois é útil
    cookieDomainRewrite: { "*": "" },
    
    // CORREÇÃO CRÍTICA 1: Definimos Headers estáticos aqui.
    // Isso evita ter que injetá-los no momento errado.
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'X-Frame-Options': '', // Tenta anular envio pelo cliente
    },

    router: (req) => {
        if (req.query.url) {
            let url = req.query.url;
            if (!url.startsWith('http')) url = 'https://' + url;
            return url;
        }
        return req.cookies.proxy_target || 'https://www.google.com';
    },

    pathRewrite: (path, req) => {
        if (req.query.url) return '/';
        return path;
    },

    // CORREÇÃO CRÍTICA 2: REMOVEMOS O 'onProxyReq' COMPLETO.
    // A tentativa de dar 'removeHeader' aqui era o que causava o crash durante redirects.
    // O 'changeOrigin: true' já cuida da maior parte do spoofing necessário.

    // Limpeza da RESPOSTA (Isso é seguro, acontece na volta)
    onProxyRes: (proxyRes, req, res) => {
        // Remove as travas de segurança do site alvo
        const headersToNuke = [
            'x-frame-options', 
            'content-security-policy', 
            'frame-options', 
            'content-security-policy-report-only',
            'cross-origin-opener-policy', 
            'cross-origin-resource-policy'
        ];

        headersToNuke.forEach(header => delete proxyRes.headers[header]);

        // Garante que o iframe aceite o conteúdo
        proxyRes.headers['access-control-allow-origin'] = '*';
        proxyRes.headers['access-control-allow-credentials'] = 'true';
        // Remove headers que forçam download ao invés de exibir
        delete proxyRes.headers['content-disposition'];
    },

    onError: (err, req, res) => {
        // Silencia erros de conexão para não derrubar o node
        if (!res.headersSent) {
            res.status(500).send('Erro Proxy: ' + err.code);
        }
    }
};

app.use('/', createProxyMiddleware(proxyOptions));

app.listen(PORT, () => console.log(`🚀 Server Blindado rodando na porta ${PORT}`));
