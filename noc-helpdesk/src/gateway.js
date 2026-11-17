/**
 * SYNOC — public gateway.
 *
 * Serves both applications from a single public port:
 *
 *   /            → SYNOC dashboard      (static, repo root)
 *   /helpdesk/   → SYNOC NOC Helpdesk   (Express + MySQL)
 *   /helpdesk/api/* → Helpdesk REST API
 *   /api/*          → Helpdesk REST API (alias)
 *
 * Why one port? GitHub Codespaces exposes a single public HTTPS endpoint
 * (`https://<codespace>-<port>.app.github.dev`) and only forwards ports
 * marked public. Running both apps behind one server means one public URL.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { ping } from './db.js';
import { authRouter } from './routes/auth.js';
import { ticketRouter } from './routes/tickets.js';
import { masterRouter } from './routes/master.js';
import { refreshBreachFlags } from './sla.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HELPDESK_PUBLIC = path.join(__dirname, '..', 'public');
const DASHBOARD_PUBLIC = path.join(__dirname, '..', '..');

const PORT = Number(process.env.PUBLIC_PORT || 8000);
const MOUNT = '/helpdesk';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api') || req.path.startsWith(`${MOUNT}/api`)) {
      console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - started}ms)`);
    }
  });
  next();
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

const healthHandler = async (req, res) => {
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
};

app.get('/api/health', healthHandler);
app.get(`${MOUNT}/api/health`, healthHandler);

// ---------------------------------------------------------------------------
// Helpdesk API (mounted twice: /api and /helpdesk/api)
// ---------------------------------------------------------------------------

app.use('/api/auth', authRouter);
app.use('/api/tickets', ticketRouter);
app.use('/api/master', masterRouter);

app.use(`${MOUNT}/api/auth`, authRouter);
app.use(`${MOUNT}/api/tickets`, ticketRouter);
app.use(`${MOUNT}/api/master`, masterRouter);

// ---------------------------------------------------------------------------
// Helpdesk frontend (static)
// ---------------------------------------------------------------------------

app.use(MOUNT, express.static(HELPDESK_PUBLIC, { extensions: ['html'] }));

// SPA fallback for the helpdesk
app.get(`${MOUNT}/*`, (req, res, next) => {
  if (req.path.startsWith(`${MOUNT}/api`)) return next();
  res.sendFile(path.join(HELPDESK_PUBLIC, 'index.html'), (err) => {
    if (err) next(err);
  });
});

// ---------------------------------------------------------------------------
// Dashboard frontend (static, repo root)
// ---------------------------------------------------------------------------

app.get('/', (req, res) => {
  res.sendFile(path.join(DASHBOARD_PUBLIC, 'index.html'));
});
app.get('/index.html', (req, res) => {
  res.sendFile(path.join(DASHBOARD_PUBLIC, 'index.html'));
});
app.get('/styles.css', (req, res) => {
  res.sendFile(path.join(DASHBOARD_PUBLIC, 'styles.css'));
});
app.get('/app.js', (req, res) => {
  res.sendFile(path.join(DASHBOARD_PUBLIC, 'app.js'));
});

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  console.error('✗', err);
  if (res.headersSent) return next(err);
  const status = err.status || (err.code === 'ER_DUP_ENTRY' ? 409 : 500);
  res.status(status).json({ error: err.message || 'Internal server error' });
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

  try {
    const n = await refreshBreachFlags();
    console.log(`✓ SLA breach flags refreshed (${n} rows)`);
  } catch (err) {
    console.warn('! SLA refresh skipped:', err.message);
  }
  setInterval(() => { refreshBreachFlags().catch(() => {}); }, 5 * 60 * 1000).unref();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ ${config.app.name} public gateway on http://0.0.0.0:${PORT}`);
    console.log(`    dashboard  → http://0.0.0.0:${PORT}/`);
    console.log(`    helpdesk   → http://0.0.0.0:${PORT}${MOUNT}/`);
  });
}

start();

export { app };
