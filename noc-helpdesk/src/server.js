/**
 * SYNOC — NOC Helpdesk System
 * Express application entry point.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { ping, query } from './db.js';
import { authRouter } from './routes/auth.js';
import { ticketRouter } from './routes/tickets.js';
import { masterRouter } from './routes/master.js';
import { refreshBreachFlags } from './sla.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Compact request log
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api')) {
      console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - started}ms)`);
    }
  });
  next();
});

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

app.get('/api/health', async (req, res) => {
  try {
    const db = await ping();
    res.json({
      status: 'ok',
      app: config.app.name,
      org: config.app.org,
      db: { connected: true, version: db.version, time: db.now },
      uptime_s: Math.round(process.uptime()),
    });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: { connected: false }, error: err.message });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/tickets', ticketRouter);
app.use('/api/master', masterRouter);

// Static frontend
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

// SPA fallback — serve index.html for any non-API route
app.get(/^(?!\/api).*/, (req, res, next) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'), (err) => {
    if (err) next(err);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  console.error('✗', err);
  if (res.headersSent) return next(err);
  const status = err.status || (err.code === 'ER_DUP_ENTRY' ? 409 : 500);
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(config.env === 'development' && err.sqlMessage ? { sql: err.sqlMessage } : {}),
  });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function start() {
  try {
    const db = await ping();
    console.log(`✓ MySQL ${db.version} connected (${config.db.database})`);
  } catch (err) {
    console.error('✗ Cannot reach MySQL:', err.message);
    console.error('  Run: npm run db:init');
    process.exit(1);
  }

  // Refresh SLA breach flags on boot, then every 5 minutes.
  try {
    const n = await refreshBreachFlags();
    console.log(`✓ SLA breach flags refreshed (${n} rows)`);
  } catch (err) {
    console.warn('! SLA refresh skipped:', err.message);
  }
  setInterval(() => {
    refreshBreachFlags().catch(() => {});
  }, 5 * 60 * 1000).unref();

  app.listen(config.port, config.host, () => {
    console.log(`✓ ${config.app.name} NOC Helpdesk listening on http://${config.host}:${config.port}`);
  });
}

start();

export { app };
