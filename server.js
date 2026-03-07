import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = parseInt(process.env.PORT || '9012', 10);
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:9006';

const app = express();

// ── API Proxy ────────────────────────────────────────────────
// Forward /v1/* to the backend. Runs BEFORE the static middleware
// so that API routes are never accidentally served as files.
app.use(
    '/v1',
    createProxyMiddleware({
        target: BACKEND_URL,
        changeOrigin: true,
        // Log proxy errors so they are visible in pm2 logs
        on: {
            error: (err, _req, res) => {
                console.error(`[proxy] ${err.message}`);
                if (!res.headersSent) {
                    res.status(502).json({ error: 'Backend unavailable' });
                }
            },
            proxyReq: (proxyReq, req) => {
                console.log(`[proxy] ${req.method} ${req.originalUrl} -> ${BACKEND_URL}${req.originalUrl}`);
            },
        },
    }),
);

// ── Static files ─────────────────────────────────────────────
app.use(express.static(join(__dirname, 'dist')));

// ── SPA fallback ─────────────────────────────────────────────
// Any route that didn't match static files or /v1/* returns index.html
// so that client-side routing works correctly.
app.get('{*path}', (_req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
});

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Meno-Web server listening on http://0.0.0.0:${PORT}`);
    console.log(`   Proxying /v1/* → ${BACKEND_URL}`);
});
