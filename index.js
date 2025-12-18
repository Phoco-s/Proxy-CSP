const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;

const VIEWPORT = { width: 1000, height: 700 };
let browser = null;
let page = null;

const MINIMAL_ARGS = [
  '--autoplay-policy=user-gesture-required',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--disable-gpu',
  '--disable-setuid-sandbox',
  '--no-first-run',
  '--no-sandbox',
  '--no-zygote',
];

async function startBrowser() {
    if (browser) return;
    console.log("🚀 Iniciando Chrome Lite...");
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: [...MINIMAL_ARGS, `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
        });
        const pages = await browser.pages();
        page = pages.length > 0 ? pages[0] : await browser.newPage();
        await page.setViewport(VIEWPORT);
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        console.log("✅ Navegador Pronto!");
    } catch (e) {
        console.error("❌ Erro Browser:", e);
        process.exit(1);
    }
}

startBrowser();

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { margin: 0; background: #111; overflow: hidden; display: flex; flex-direction: column; height: 100vh; font-family: sans-serif; color: #ccc; }
                #controls { background: #222; padding: 10px; display: flex; gap: 10px; border-bottom: 1px solid #444; align-items: center; }
                input { flex: 1; padding: 8px; border-radius: 4px; border: none; background: #333; color: #fff; outline: none; }
                button { padding: 8px 15px; cursor: pointer; background: #6699cc; color: white; border: none; border-radius: 4px; font-weight: bold; }
                #status { font-size: 12px; color: #888; }
                #screen-container { flex: 1; position: relative; cursor: default; display: flex; justify-content: center; align-items: flex-start; background: #000; }
                img { display: block; max-width: 100%; user-select: none; -webkit-user-drag: none; }
            </style>
        </head>
        <body>
            <div id="controls">
                <input id="urlInput" placeholder="URL (ex: example.com)" />
                <button onclick="navigate()">Ir 🚀</button>
                <span id="status">Conectando...</span>
            </div>
            <div id="screen-container">
                <img id="stream" alt="Carregando stream..." />
            </div>

            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io({transports: ['websocket', 'polling']});
                const img = document.getElementById('stream');
                const status = document.getElementById('status');
                
                socket.on('connect', () => { status.innerText = "🟢 Online"; });
                socket.on('disconnect', () => { status.innerText = "🔴 Offline"; });

                // Inicia o stream imediatamente
                img.src = "/stream?t=" + Date.now();

                function navigate() {
                    let url = document.getElementById('urlInput').value;
                    if(!url) return;
                    if (!url.startsWith('http')) url = 'https://' + url;
                    status.innerText = "🟡 Navegando...";
                    fetch('/navigate?url=' + encodeURIComponent(url))
                        .then(() => {
                            status.innerText = "🟢 Carregado";
                            // Força recarga da imagem caso tenha travado
                            setTimeout(() => img.src = "/stream?t=" + Date.now(), 1000);
                        });
                }

                document.getElementById('urlInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') navigate(); });

                img.onmousedown = (e) => {
                    const rect = img.getBoundingClientRect();
                    const scaleX = ${VIEWPORT.width} / rect.width;
                    const scaleY = ${VIEWPORT.height} / rect.height;
                    socket.emit('input', { type: 'click', x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY });
                };
            </script>
        </body>
        </html>
    `);
});

app.get('/navigate', async (req, res) => {
    if (!page) await startBrowser();
    try {
        let url = req.query.url;
        console.log("🌐 Indo para:", url);
        // Timeout curto para liberar a resposta rápido
        page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(e => console.log("Load bg..."));
        res.send('ok');
    } catch (e) { res.status(500).send(e.message); }
});

// STREAM OTIMIZADO (SEM TRAVAMENTO)
app.get('/stream', async (req, res) => {
    if (!page) await startBrowser();
    
    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=--frame',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
    });

    let frameCount = 0;
    let isActive = true;

    const sendFrame = async () => {
        if (!isActive) return;
        try {
            if (page && !page.isClosed()) {
                // Qualidade 30 para ser RÁPIDO
                const screenshot = await page.screenshot({ type: 'jpeg', quality: 30, optimizeForSpeed: true });
                
                res.write(`--frame\nContent-Type: image/jpeg\nContent-Length: ${screenshot.length}\n\n`);
                res.write(screenshot);
                res.write('\n');
                
                frameCount++;
                if (frameCount % 20 === 0) console.log(`📸 Stream ativo: ${frameCount} frames`);
            }
        } catch (e) {
            console.log("⚠️ Frame drop:", e.message);
        }
        
        // Só agenda o próximo quando este terminar (Evita gargalo de memória)
        setTimeout(sendFrame, 200); 
    };

    sendFrame();

    req.on('close', () => {
        isActive = false;
        console.log("Cliente desconectou do stream");
    });
});

io.on('connection', (socket) => {
    socket.on('input', async (data) => {
        if (!page) return;
        try {
            if (data.type === 'click') await page.mouse.click(data.x, data.y);
        } catch(e){}
    });
});

server.listen(PORT, () => console.log(`🚀 Server rodando na porta ${PORT}`));
