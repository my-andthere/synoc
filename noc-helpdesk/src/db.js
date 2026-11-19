import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
  // PENTING: kolom DATETIME di database berisi waktu LOKAL (dihasilkan
  // CURRENT_TIMESTAMP / NOW() pada server database). mysql2 harus membacanya
  // sebagai waktu lokal — bukan UTC — supaya jam yang tampil di browser sama
  // dengan jam yang tersimpan. Dengan `timezone: 'Z'` semua jam tampil +7 jam
  // (lebih awal/later) dari aslinya.
  timezone: 'local',
  dateStrings: false,
  namedPlaceholders: false,
  supportBigNumbers: true,
  bigNumberStrings: false,
});

/**
 * Samakan zona waktu SESSION MySQL dengan zona waktu proses Node.
 *
 * Dengan begitu `NOW()` / `CURRENT_TIMESTAMP` di SQL memakai wall clock yang
 * sama dengan interpretasi `timezone: 'local'` milik mysql2 — sehingga
 * perbandingan SLA (`NOW() > resolution_due_at`) selalu konsisten.
 */
function localUtcOffset() {
  // getTimezoneOffset() positif untuk zona di belakang UTC (mis. WIB = -420).
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

// Setiap koneksi pool disetel ke zona waktu lokal proses Node.
pool.pool.on('connection', (conn) => {
  conn.query(`SET time_zone = '${localUtcOffset()}'`);
});

/** Run a SELECT and return rows. */
export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Run a SELECT and return the first row (or null). */
export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length ? rows[0] : null;
}

/** Run an INSERT/UPDATE/DELETE and return the raw result. */
export async function execute(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result;
}

/** Run a callback inside a transaction, auto-committing or rolling back. */
export async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Health probe used by /api/health and by the bootstrap script. */
export async function ping() {
  const row = await queryOne('SELECT VERSION() AS version, NOW() AS now');
  return row;
}

/**
 * Escape an identifier (table/column) for safe interpolation.
 * Only used with hard-coded identifiers — never with user input.
 */
export function ident(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe identifier: ${name}`);
  }
  return `\`${name}\``;
}
