const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());

app.get('/status', (req, res) => res.send('🥷 Stealth Proxy v8.0 (CSP Killer)'));

// Middleware de Cookie
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
    followRedirects: true,
    cookieDomainRewrite: { "*": "" },
    
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

    // 1. Mimetização Humana Avançada (Tenta enganar Cloudflare)
    onProxyReq: (proxyReq, req, res) => {
        // Remove rastros de proxy
        const stripHeaders = ['x-forwarded-for', 'via', 'x-real-ip', 'forwarded', 'x-cloud-trace-context'];
        stripHeaders.forEach(h => proxyReq.removeHeader(h));

        // Injeta identidade de um Chrome Windows legítimo
        proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');
        proxyReq.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7');
        proxyReq.setHeader('Accept-Language', 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7');
        proxyReq.setHeader('Accept-Encoding', 'gzip, deflate, br');
        proxyReq.setHeader('Cache-Control', 'max-age=0');
        proxyReq.setHeader('Upgrade-Insecure-Requests', '1');
        
        // Headers de Segurança Sec-Fetch (Cruciais para bypass moderno)
        proxyReq.setHeader('Sec-Fetch-Dest', 'document');
        proxyReq.setHeader('Sec-Fetch-Mode', 'navigate');
        proxyReq.setHeader('Sec-Fetch-Site', 'none');
        proxyReq.setHeader('Sec-Fetch-User', '?1');
        proxyReq.setHeader('Sec-Ch-Ua', '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"');
        proxyReq.setHeader('Sec-Ch-Ua-Mobile', '?0');
        proxyReq.setHeader('Sec-Ch-Ua-Platform', '"Windows"');

        // Spoofing de Referer/Origin
        const target = req.query.url || req.cookies.proxy_target;
        if (target) {
            try {
                const origin = new URL(target.startsWith('http') ? target : 'https://' + target).origin;
                proxyReq.setHeader('Origin', origin);
                proxyReq.setHeader('Referer', origin + '/');
            } catch (e) {}
        }
    },

    // 2. Aniquilação Total de CSP (Resolve o erro frame-ancestors do Notion)
    onProxyRes: (proxyRes, req, res) => {
        // Varre TODOS os headers da resposta
        Object.keys(proxyRes.headers).forEach(header => {
            const headerName = header.toLowerCase();
            // Se o header tiver cheiro de segurança ou frame, DELETA.
            if (
                headerName.includes('content-security-policy') ||
                headerName.includes('x-frame-options') ||
                headerName.includes('frame-ancestors') ||
                headerName.includes('frame-options') ||
                headerName.includes('cross-origin') ||
                headerName.includes('strict-transport-security') // Às vezes atrapalha downgrade http
            ) {
                delete proxyRes.headers[header];
            }
        });

        // Força permissão
        proxyRes.headers['access-control-allow-origin'] = '*';
        proxyRes.headers['access-control-allow-credentials'] = 'true';
    },

    onError: (err, req, res) => {
        console.error('Proxy Error:', err.message);
        if (!res.headersSent) {
            // Se for 403/429, avisa o usuário que é o Cloudflare
            if (err.message.includes('403') || err.message.includes('429')) {
                res.status(403).send('<h1>Bloqueio Cloudflare Detectado</h1><p>O sistema de segurança do site identificou que o acesso vem de um servidor de nuvem (Render).</p>');
            } else {
                res.status(500).send(`Erro: ${err.message}`);
            }
        }
    }
};

app.use('/', createProxyMiddleware(proxyOptions));

app.listen(PORT, () => console.log(`🥷 Stealth v8 rodando na porta ${PORT}`));
