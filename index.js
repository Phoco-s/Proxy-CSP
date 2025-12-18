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

// Configuração Otimizada para Render Free
const VIEWPORT = { width: 1000, height: 700 };
let browser = null;
let page = null;

// Argumentos para rodar com pouca RAM (Modo Dieta)
const MINIMAL_ARGS = [
  '--autoplay-policy=user-gesture-required',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-breakpad',
  '--disable-client-side-phishing-detection',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-dev-shm-usage', // CRUCIAL no Render/Docker
  '--disable-domain-reliability',
  '--disable-extensions',
  '--disable-features=AudioServiceOutOfProcess',
  '--disable-hang-monitor',
  '--disable-ipc-flooding-protection',
  '--disable-notifications',
  '--disable-offer-store-unmasked-wallet-cards',
  '--disable-popup-blocking',
  '--disable-print-preview',
  '--disable-prompt-on-repost',
  '--disable-renderer-backgrounding',
  '--disable-setuid-sandbox',
  '--disable-speech-api',
  '--disable-sync',
  '--hide-scrollbars',
  '--ignore-gpu-blacklist',
  '--metrics-recording-only',
  '--mute-audio',
  '--no-default-browser-check',
  '--no-first-run',
  '--no-pings',
  '--no-sandbox', // CRUCIAL
  '--no-zygote',
  '--password-store=basic',
  '--use-gl=swiftshader',
  '--use-mock-keychain',
];

async function startBrowser() {
    if (browser) return;
    console.log("🚀 Iniciando Chrome Lite...");
    
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: [...MINIMAL_ARGS, `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
            userDataDir: './my-user-data' // Tenta salvar cache no disco efêmero para economizar RAM
        });
        
        // Abre apenas UMA aba e reutiliza ela sempre
        const pages = await browser.pages();
        page = pages.length > 0 ? pages[0] : await browser.newPage();
        
        await page.setViewport(VIEWPORT);
        // User Agent para não parecer robô
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log("✅ Navegador Pronto!");
    } catch (e) {
        console.error("Erro fatal ao abrir navegador:", e);
        browser = null;
        page = null;
    }
}

// Inicializa
startBrowser();

// 1. O Viewer (HTML que vai dentro do iframe)
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { margin: 0; background: #111; overflow: hidden; display: flex; flex-direction: column; height: 100vh; font-family: sans-serif; }
                #controls { background: #222; padding: 10px; display: flex; gap: 10px; border-bottom: 1px solid #444; }
                input { flex: 1; padding: 8px; border-radius: 4px; border: none; background: #333; color: #fff; outline: none; }
                button { padding: 8px 15px; cursor: pointer; background: #6699cc; color: white; border: none; border-radius: 4px; font-weight: bold; }
                #screen-container { flex: 1; position: relative; cursor: default; display: flex; justify-content: center; align-items: flex-start; background: #000; }
                img { display: block; max-width: 100%; user-select: none; -webkit-user-drag: none; }
            </style>
        </head>
        <body>
            <div id="controls">
                <input id="urlInput" placeholder="URL (ex: google.com)" />
                <button onclick="navigate()">Ir 🚀</button>
                <button onclick="reload()" style="background:#555">↻</button>
            </div>
            <div id="screen-container">
                <img id="stream" src="/stream" />
            </div>

            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io({transports: ['websocket']});
                const img = document.getElementById('stream');
                const input = document.getElementById('urlInput');
                
                function navigate() {
                    let url = input.value;
                    if(!url) return;
                    fetch('/navigate?url=' + encodeURIComponent(url));
                }
                
                function reload() {
                    img.src = "/stream?t=" + Date.now();
                }

                input.addEventListener('keydown', (e) => { if (e.key === 'Enter') navigate(); });

                // Lógica de Clique com Conversão de Coordenadas
                img.onmousedown = (e) => {
                    const rect = img.getBoundingClientRect();
                    // Importante: Calcula a proporção caso a imagem tenha sido redimensionada pelo CSS
                    const scaleX = ${VIEWPORT.width} / rect.width;
                    const scaleY = ${VIEWPORT.height} / rect.height;
                    
                    const x = (e.clientX - rect.left) * scaleX;
                    const y = (e.clientY - rect.top) * scaleY;
                    
                    socket.emit('input', { type: 'click', x, y });
                };

                document.addEventListener('keydown', (e) => {
                    if (document.activeElement !== input) {
                        e.preventDefault();
                        if (e.key.length === 1) socket.emit('input', { type: 'type', key: e.key });
                        else socket.emit('input', { type: 'keyPress', key: e.key });
                    }
                });

                img.onwheel = (e) => {
                    e.preventDefault();
                    socket.emit('input', { type: 'scroll', deltaY: e.deltaY });
                };
            </script>
        </body>
        </html>
    `);
});

// 2. Endpoint de Navegação
app.get('/navigate', async (req, res) => {
    if (!page) await startBrowser();
    try {
        let url = req.query.url;
        if (!url.startsWith('http')) url = 'https://' + url;
        console.log("Navegando para:", url);
        // Timeout curto para não travar a thread
        page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => console.log("Carregamento em background..."));
        res.send('Navegando...');
    } catch (e) { res.status(500).send(e.message); }
});

// 3. Stream MJPEG (Otimizado)
app.get('/stream', async (req, res) => {
    if (!page) await startBrowser();
    
    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=--frame',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
    });

    const loop = setInterval(async () => {
        try {
            if (page && !page.isClosed()) {
                // Quality 40 é feio, mas rápido e leve. Aumente se o Render aguentar.
                const screenshot = await page.screenshot({ type: 'jpeg', quality: 40, optimizeForSpeed: true });
                res.write(`--frame\nContent-Type: image/jpeg\nContent-Length: ${screenshot.length}\n\n`);
                res.write(screenshot);
                res.write('\n');
            } else {
                await startBrowser(); // Tenta reviver se morreu
            }
        } catch (e) {
            console.log("Frame drop");
        }
    }, 250); // 4 FPS (Economia de CPU)

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

server.listen(PORT, () => console.log(`🚀 Puppeteer Lite rodando na porta ${PORT}`));
