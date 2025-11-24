const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));

app.get('/status', (req, res) => res.send('🥷 Navigator Stealth Tunnel (v4.3)'));

app.use('/proxy', (req, res, next) => {
    const targetUrl = req.query.url;

    if (!targetUrl) return res.status(400).send('Url required');

    let finalTarget = targetUrl;
    if (!finalTarget.startsWith('http')) finalTarget = 'https://' + finalTarget;

    // Extrai o domínio alvo para usar nos headers falsos
    let targetDomain = '';
    try {
        targetDomain = new URL(finalTarget).origin;
    } catch (e) {
        console.error("URL Inválida");
    }

    createProxyMiddleware({
        target: finalTarget,
        changeOrigin: true, // Isso muda o Host header para o do alvo
        ws: true,
        pathRewrite: { '^/proxy': '' },
        followRedirects: true,
        cookieDomainRewrite: { "*": "" }, // Tenta fazer os cookies funcionarem no localhost/render
        
        onProxyReq: (proxyReq, req, res) => {
            // 1. A MENTIRA PERFEITA (Spoofing)
            // Dizemos ao site que estamos vindo dele mesmo
            if (targetDomain) {
                proxyReq.setHeader('Origin', targetDomain);
                proxyReq.setHeader('Referer', targetDomain + '/');
            }

            // 2. CAMUFLAGEM (Stealth)
            // Removemos cabeçalhos que o Render adiciona e que denunciam o proxy
            proxyReq.removeHeader('x-forwarded-for');
            proxyReq.removeHeader('x-forwarded-proto');
            proxyReq.removeHeader('x-forwarded-port');
            proxyReq.removeHeader('via');

            // User-Agent de um Chrome Comum
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        },

        onProxyRes: (proxyRes, req, res) => {
            // Remove as travas de segurança do Notion/Google
            const badHeaders = [
                'x-frame-options', 
                'content-security-policy', 
                'frame-options', 
                'content-security-policy-report-only'
            ];
            badHeaders.forEach(h => delete proxyRes.headers[h]);

            // Força permissão para rodar no iframe
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        },

        onError: (err, req, res) => {
            console.error('❌ Stealth Error:', err.message);
            if (!res.headersSent) res.status(500).send('WAF Block ou Erro: ' + err.message);
        }
    })(req, res, next);
});

app.listen(PORT, () => console.log(`🥷 Stealth Proxy rodando na porta ${PORT}`));
