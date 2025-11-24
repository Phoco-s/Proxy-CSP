const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));

app.get('/status', (req, res) => res.send('✅ Navigator Tunnel Stable (v5.0)'));

app.use('/proxy', (req, res, next) => {
    const targetUrl = req.query.url;

    if (!targetUrl) return res.status(400).send('Url required');

    let finalTarget = targetUrl;
    if (!finalTarget.startsWith('http')) finalTarget = 'https://' + finalTarget;

    createProxyMiddleware({
        target: finalTarget,
        changeOrigin: true, // Muda o 'Host' header automaticamente (Vital para Notion)
        ws: true, // WebSockets para Slack
        pathRewrite: { '^/proxy': '' },
        followRedirects: true, // Segue login do Google/Notion
        
        // 1. CORREÇÃO CRÍTICA: Definimos headers aqui, não no onProxyReq
        // Isso evita o erro ERR_HTTP_HEADERS_SENT durante redirecionamentos
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'X-Frame-Options': '', // Tenta anular envio pelo cliente
        },

        // 2. Limpeza da RESPOSTA (O que vem do site para você)
        onProxyRes: (proxyRes, req, res) => {
            // Remove travas de segurança do Notion/Google
            const badHeaders = [
                'x-frame-options', 
                'content-security-policy', 
                'frame-options', 
                'content-security-policy-report-only',
                'access-control-allow-origin' // Nós vamos definir isso manualmente abaixo
            ];
            
            badHeaders.forEach(h => delete proxyRes.headers[h]);

            // Permite o iframe
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
            proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
            proxyRes.headers['Access-Control-Allow-Headers'] = 'X-Requested-With, Content-Type, Authorization';
        },

        // 3. Tratamento de Erros (Para o servidor não cair nunca mais)
        onError: (err, req, res) => {
            console.error('⚠️ Erro de Proxy:', err.code);
            if (!res.headersSent) {
                res.status(500).send(`Erro de conexão: ${err.message}`);
            }
        }
    })(req, res, next);
});

app.listen(PORT, () => console.log(`🚀 Stable Proxy rodando na porta ${PORT}`));
