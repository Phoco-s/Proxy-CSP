const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let browser;
let page;

// Inicializa o Chrome no Servidor
async function initBrowser() {
    if (browser) return;
    browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    console.log("🤖 Browser Remoto Iniciado");
}

initBrowser();

// 1. Endpoint para navegar para uma URL
app.post('/navigate', async (req, res) => {
    const { url } = req.body;
    if (!page) await initBrowser();
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 }).catch(e => console.log("Carregamento contínuo..."));
        res.json({ status: 'ok' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. O CORAÇÃO DO SURFLY: Stream de Imagens (MJPEG)
// O cliente carrega <img src="/stream"> e vê o site em tempo real
app.get('/stream', async (req, res) => {
    if (!page) await initBrowser();

    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=--myboundary',
        'Cache-Control': 'no-cache',
        'Connection': 'close',
        'Pragma': 'no-cache'
    });

    const streamLoop = setInterval(async () => {
        try {
            // Tira screenshot em buffer (rápido)
            const screenshot = await page.screenshot({ type: 'jpeg', quality: 60 });
            res.write(`--myboundary\nContent-Type: image/jpeg\nContent-Length: ${screenshot.length}\n\n`);
            res.write(screenshot);
            res.write('\n');
        } catch (e) {
            clearInterval(streamLoop);
        }
    }, 200); // 5 frames por segundo (Aumente para melhor fluidez, mas gasta mais CPU)

    req.on('close', () => clearInterval(streamLoop));
});

// 3. Recebe Interações do Usuário (Clique/Teclado) via Socket.IO
io.on('connection', (socket) => {
    console.log('Cliente conectado ao controle remoto');

    socket.on('interaction', async (data) => {
        if (!page) return;
        try {
            if (data.type === 'click') {
                // Converte coordenadas do iframe para o navegador real
                await page.mouse.click(data.x, data.y);
            } else if (data.type === 'scroll') {
                await page.mouse.wheel({ deltaY: data.deltaY });
            } else if (data.type === 'key') {
                await page.keyboard.type(data.key);
            }
        } catch (e) {
            console.error("Erro de interação:", e.message);
        }
    });
});

http.listen(PORT, () => console.log(`📺 Streaming Server rodando na porta ${PORT}`));
