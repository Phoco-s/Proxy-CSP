const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));

app.get('/status', (req, res) => res.send('⚡ Navigator Tunnel está ONLINE (v4.2 Fixed)'));

app.use('/proxy', (req, res, next) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('Faltou a URL alvo (?url=...)');
    }

    // Validação básica para evitar erros de protocolo
    let finalTarget = targetUrl;
    if (!finalTarget.startsWith('http')) {
        finalTarget = 'https://' + finalTarget;
    }

    createProxyMiddleware({
        target: finalTarget,
        changeOrigin: true,
        ws: true, // Suporte a WebSockets (Slack/Notion)
        pathRewrite: {
            '^/proxy': '', 
        },
        // CORREÇÃO: Definimos os headers aqui para evitar o erro ERR_HTTP_HEADERS_SENT
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        },
        followRedirects: true, // Importante para login do Google/Notion
        
        onProxyRes: (proxyRes, req, res) => {
            // Remove travas de segurança
            const securityHeaders = [
                'x-frame-options', 
                'content-security-policy', 
                'frame-options', 
                'content-security-policy-report-only'
            ];

            securityHeaders.forEach(header => {
                delete proxyRes.headers[header];
            });

            // Garante permissão de CORS no retorno
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        },
        
        // CORREÇÃO: Tratamento de erros para não derrubar o servidor
        onError: (err, req, res) => {
            console.error('❌ Erro no Proxy:', err.message);
            // Evita tentar responder se a conexão já fechou
            if (!res.headersSent) {
                res.status(500).send('Erro no Tunnel: ' + err.message);
            }
        }
    })(req, res, next);
});

app.listen(PORT, () => {
    console.log(`🛡️ Tunnel de Produtividade rodando na porta ${PORT}`);
});
