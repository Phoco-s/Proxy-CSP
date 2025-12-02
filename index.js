const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;

// Variáveis Globais do Navegador
let browser = null;
let page = null;
let streamInterval = null;

// Configuração da Resolução (Deve bater com o tamanho da janela da extensão)
const VIEWPORT = { width: 1000, height: 700 };

async function startBrowser() {
    if (browser) return;
    console.log("🚀 Iniciando Chrome Remoto...");
    
    browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // Vital para Docker/Render
            `--window-size=${VIEWPORT.width},${VIEWPORT.height}`
        ]
    });
    
    page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    
    // User Agent de gente normal
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log("✅ Navegador Pronto!");
}

startBrowser();

// 1. Endpoint de Navegação (Muda a URL)
app.get('/navigate', async (req, res) => {
    const url = req.query.url;
    if (!page) await startBrowser();
    
    try {
        let target = url.startsWith('http') ? url : 'https://' + url;
        console.log(`Página indo para: ${target}`);
        await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 });
        res.send('OK');
    } catch (e) {
        console.error(e);
        res.status(500).send(e.message);
    }
});

// 2. O Stream de Vídeo (MJPEG)
// O navegador local vai carregar <img src="/stream">
app.get('/stream', async (req, res) => {
    if (!page) await startBrowser();

    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=--frame',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Pragma': 'no-cache'
    });

    // Loop de Captura (FPS)
    // No Free Tier, 200ms (5fps) é seguro. Se tiver servidor bom, tente 50ms (20fps).
    const loop = setInterval(async () => {
        try {
            if (!page) return;
            // Tira screenshot em buffer (JPEG é mais leve que PNG)
            const screenshot = await page.screenshot({ type: 'jpeg', quality: 50 });
            
            res.write(`--frame\nContent-Type: image/jpeg\nContent-Length: ${screenshot.length}\n\n`);
            res.write(screenshot);
            res.write('\n');
        } catch (error) {
            // Ignora erros de frame drop
        }
    }, 200);

    req.on('close', () => {
        clearInterval(loop);
    });
});

// 3. Canal de Controle (Mouse/Teclado via Socket)
io.on('connection', (socket) => {
    console.log('🎮 Controle Remoto Conectado');

    socket.on('input', async (data) => {
        if (!page) return;
        try {
            if (data.type === 'click') {
                await page.mouse.click(data.x, data.y);
            } 
            else if (data.type === 'type') {
                await page.keyboard.type(data.key);
            }
            else if (data.type === 'keyPress') {
                 await page.keyboard.press(data.key);
            }
            else if (data.type === 'scroll') {
                await page.mouse.wheel({ deltaY: data.deltaY });
            }
        } catch (e) {
            console.error("Input lag:", e.message);
        }
    });
});

server.listen(PORT, () => console.log(`📺 Pixel Streaming rodando na porta ${PORT}`));
