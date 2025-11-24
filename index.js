const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const app = express();

const PORT = process.env.PORT || 3000;

// Permite que seu UserScript acesse de qualquer lugar
app.use(cors({ origin: true, credentials: true }));

// Rota de verificação
app.get('/status', (req, res) => res.send('⚡ Navigator Tunnel está ONLINE'));

// A MÁGICA: Middleware de Proxy Dinâmico
// O UserScript vai chamar: https://seu-app.com/proxy?url=https://notion.so
app.use('/proxy', (req, res, next) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('Faltou a URL alvo (?url=...)');
    }

    // Configuração robusta para enganar Notion/Slack
    const proxyOptions = {
        target: targetUrl,
        changeOrigin: true, // Muda o cabeçalho 'Host' para o do alvo (CRUCIAL para o Notion)
        ws: true, // Habilita WebSockets (CRUCIAL para o Slack)
        pathRewrite: {
            '^/proxy': '', // Remove o /proxy da url
        },
        onProxyRes: (proxyRes, req, res) => {
            // Remove travas de segurança do site original
            delete proxyRes.headers['x-frame-options'];
            delete proxyRes.headers['content-security-policy'];
            delete proxyRes.headers['frame-options'];
            
            // Permite que o navegador renderize o conteúdo
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        },
        onProxyReq: (proxyReq, req, res) => {
            // Engana o site dizendo que a requisição veio de um navegador real
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        },
        // Segue redirecionamentos (Login do Google -> Notion)
        followRedirects: true,
        cookieDomainRewrite: {
            "*": "" // Reescreve cookies para funcionar no seu domínio
        }
    };

    // Cria o proxy na hora
    createProxyMiddleware(proxyOptions)(req, res, next);
});

app.listen(PORT, () => {
    console.log(`🛡️ Tunnel de Produtividade rodando na porta ${PORT}`);
});
