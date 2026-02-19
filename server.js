const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
};

const { getDividendHistory, saveHistory } = require('./services/dividend_history');

const server = http.createServer(async (req, res) => {
    console.log(`${req.method} ${req.url}`);

    // API Endpoint for on-demand history scraping
    if (req.url.startsWith('/api/history/')) {
        const ticker = req.url.split('/').pop().toUpperCase();
        console.log(`📡 On-demand history fetch for: ${ticker}`);
        try {
            const divs = await getDividendHistory(ticker);
            if (divs && divs.length > 0) {
                await saveHistory(ticker, divs);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ticker, history: divs }));
                return;
            } else {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'History not found for ' + ticker }));
                return;
            }
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: e.message }));
            return;
        }
    }

    // API Endpoint for on-demand price history (Brapi.dev)
    if (req.url.startsWith('/api/price-history/')) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const ticker = url.pathname.split('/').pop().toUpperCase();
        const range = url.searchParams.get('range') || '1y';
        const interval = url.searchParams.get('interval') || '1d';

        console.log(`📡 Fetching price history for: ${ticker} (Range: ${range}, Interval: ${interval})`);
        try {
            const response = await fetch(`https://brapi.dev/api/quote/${ticker}?range=${range}&interval=${interval}`);
            if (!response.ok) {
                res.writeHead(response.status);
                res.end(JSON.stringify({ error: 'Failed to fetch price from Brapi' }));
                return;
            }
            const data = await response.json();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data.results[0] || {}));
            return;
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: e.message }));
            return;
        }
    }

    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

function startServer(port) {
    server.listen(port, () => {
        console.log(`\x1b[32m%s\x1b[0m`, `🚀 Servidor rodando em: http://localhost:${port}`);
        console.log(`Pressione Ctrl+C para parar.`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`⚠️  Porta ${port} em uso, tentando ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error('Server error:', err);
        }
    });
}

startServer(PORT);
