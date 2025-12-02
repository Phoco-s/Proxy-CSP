const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

// Configuração da Resolução
const VIEWPORT = { width: 1000, height: 700 };
let browser = null;
let page = null;

// Inicializa o Navegador
async function startBrowser() {
    if (browser) return;
    console.log("🚀 Iniciando Chrome Remoto...");
    browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            `--window-size=${VIEWPORT.width},${VIEWPORT.height}`
        ]
    });
    page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
}

startBrowser();

// 1. O "Viewer" (Interface do Cliente que roda dentro do iframe)
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { margin: 0; background: #000; overflow: hidden; display: flex; flex-direction: column; height: 100vh; font-family: sans-serif; }
                #controls { background: #222; padding: 10px; display: flex; gap: 10px; }
                input { flex: 1; padding: 8px; border-radius: 4px; border: none; background: #333; color: #fff; }
                button { padding: 8px 15px; cursor: pointer; background: #6699cc; color: white; border: none; border-radius: 4px; font-weight: bold; }
                #screen-container { flex: 1; position: relative; cursor: default; display: flex; justify-content: center; align-items: center; }
                img { display: block; max-width: 100%; max-height: 100%; user-select: none; -webkit-user-drag: none; }
            </style>
        </head>
        <body>
            <div id="controls">
                <input id="urlInput" placeholder="URL (ex: notion.so)" />
                <button onclick="navigate()">Ir 🚀</button>
            </div>
            <div id="screen-container">
                <img id="stream" src="/stream" />
            </div>

            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                const img = document.getElementById('stream');
                const input = document.getElementById('urlInput');
                const container = document.getElementById('screen-container');

                function navigate() {
                    const url = input.value;
                    fetch('/navigate?url=' + encodeURIComponent(url))
                        .then(() => img.src = "/stream?t=" + Date.now()); // Recarrega stream
                }

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') navigate();
                });

                // Captura Cliques
                img.onmousedown = (e) => {
                    const rect = img.getBoundingClientRect();
                    // Calcula a posição relativa baseada no tamanho real da imagem renderizada
                    const scaleX = ${VIEWPORT.width} / rect.width;
                    const scaleY = ${VIEWPORT.height} / rect.height;
                    
                    const x = (e.clientX - rect.left) * scaleX;
                    const y = (e.clientY - rect.top) * scaleY;
                    
                    socket.emit('input', { type: 'click', x, y });
                };

                // Captura Teclado
                document.addEventListener('keydown', (e) => {
                    if (document.activeElement !== input) {
                        if (e.key.length === 1) socket.emit('input', { type: 'type', key: e.key });
                        else socket.emit('input', { type: 'keyPress', key: e.key });
                    }
                });

                // Captura Scroll
                container.onwheel = (e) => {
                    e.preventDefault();
                    socket.emit('input', { type: 'scroll', deltaY: e.deltaY });
                };
            </script>
        </body>
        </html>
    `);
});

// 2. Navegação
app.get('/navigate', async (req, res) => {
    if (!page) await startBrowser();
    try {
        let url = req.query.url;
        if (!url.startsWith('http')) url = 'https://' + url;
        console.log("Navegando para:", url);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(e=>console.log(e));
        res.send('ok');
    } catch (e) { res.status(500).send(e.message); }
});

// 3. Stream MJPEG
app.get('/stream', async (req, res) => {
    if (!page) await startBrowser();
    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=--frame',
        'Connection': 'keep-alive'
    });
    const loop = setInterval(async () => {
        try {
            if (page) {
                const buff = await page.screenshot({ type: 'jpeg', quality: 50 });
                res.write(`--frame\nContent-Type: image/jpeg\nContent-Length: ${buff.length}\n\n`);
                res.write(buff);
                res.write('\n');
            }
        } catch (e) {}
    }, 200); // 5 FPS
    req.on('close', () => clearInterval(loop));
});

// 4. Socket IO (Inputs)
io.on('connection', (socket) => {
    socket.on('input', async (data) => {
        if (!page) return;
        try {
            if (data.type === 'click') await page.mouse.click(data.x, data.y);
            else if (data.type === 'type') await page.keyboard.type(data.key);
            else if (data.type === 'keyPress') await page.keyboard.press(data.key);
            else if (data.type === 'scroll') await page.mouse.wheel({ deltaY: data.deltaY });
        } catch(e){}
    });
});

server.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
