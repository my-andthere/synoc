/**
 * SYNOC — database bootstrap.
 *
 * Creates the database (if missing), applies the schema, and seeds
 * master data + SLA policies + a default admin account.
 *
 *   node db/init.js            # create + apply + seed (idempotent)
 *   node db/init.js --reset    # DROP every object first, then rebuild
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESET = process.argv.includes('--reset');

/** Connect without selecting a schema (needed to CREATE DATABASE). */
async function rootConnection() {
  return mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.rootUser,
    password: config.db.rootPassword,
    multipleStatements: true,
  });
}

async function dropAll(conn, dbName) {
  console.log('  → dropping existing objects');
  await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
}

/**
 * Strip line comments from a SQL script.
 * Our schema has no `--` inside string literals, so a simple line scan is safe.
 */
function stripComments(sql) {
  return sql
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');
}

/** Split a SQL script into individual statements (comments removed first). */
function splitStatements(sql) {
  return stripComments(sql)
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function applySchema(conn) {
  const file = path.join(__dirname, 'schema.sql');
  const sql = await fs.readFile(file, 'utf8');
  console.log('  → applying schema.sql');
  for (const stmt of splitStatements(sql)) {
    try {
      await conn.query(stmt);
    } catch (err) {
      console.error('\n--- failed statement ---\n' + stmt.slice(0, 500));
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const SERVICE_TYPES = [
  { code: 'ACCESS',    name: 'Access',    description: 'Last-mile / subscriber access link', sort_order: 1 },
  { code: 'BACKBONE',  name: 'Backbone',  description: 'Core / backbone transmission link',   sort_order: 2 },
  { code: 'FISHBONE',  name: 'Fishbone',  description: 'Fishbone distribution topology',      sort_order: 3 },
  { code: 'OTHER',     name: 'Other',     description: 'Other service category',              sort_order: 4 },
];

const PRIORITIES = [
  { code: 'LOW',      name: 'Low',      level: 4, response_hours: 24, resolution_hours: 48, color: '#64748b', sort_order: 1 },
  { code: 'MEDIUM',   name: 'Medium',   level: 3, response_hours: 12, resolution_hours: 24, color: '#0ea5e9', sort_order: 2 },
  { code: 'HIGH',     name: 'High',     level: 2, response_hours: 4,  resolution_hours: 8,  color: '#f59e0b', sort_order: 3 },
  { code: 'CRITICAL', name: 'Critical', level: 1, response_hours: 1,  resolution_hours: 4,  color: '#ef4444', sort_order: 4 },
];

const CHANNELS = [
  { code: 'CUSTOM',   name: 'Custom',   icon: 'bi-pencil-square', sort_order: 1 },
  { code: 'EMAIL',    name: 'Email',    icon: 'bi-envelope',      sort_order: 2 },
  { code: 'TELEGRAM', name: 'Telegram', icon: 'bi-telegram',      sort_order: 3 },
  { code: 'WHATSAPP', name: 'WhatsApp', icon: 'bi-chat-dots',     sort_order: 4 },
  { code: 'PHONE',    name: 'Phone',    icon: 'bi-telephone',     sort_order: 5 },
  { code: 'PORTAL',   name: 'Portal',   icon: 'bi-globe',         sort_order: 6 },
];

const CUSTOMERS = [
  { code: 'CUST-001', name: 'PT. Maju Jaya Sentosa', contact_name: 'Budi Santoso',  contact_phone: '08123456001', contact_email: 'budi@majujaya.co.id' },
  { code: 'CUST-002', name: 'CV. Nusa Digital',      contact_name: 'Siti Rahayu',   contact_phone: '08123456002', contact_email: 'siti@nusadigital.id' },
  { code: 'CUST-003', name: 'PT. Telkom Indonesia',   contact_name: 'Andi Wijaya',   contact_phone: '08123456003', contact_email: 'andi@telkom.co.id' },
];

const ISPS = [
  { code: 'ISP-001', name: 'PT. XL Axiata Tbk',          contact_name: 'Rudi Hartono',  contact_phone: '08123456011', contact_email: 'noc@xlaxiata.co.id' },
  { code: 'ISP-002', name: 'PT. Indosat Ooredoo Hutchison', contact_name: 'Dewi Lestari', contact_phone: '08123456012', contact_email: 'noc@indosatooredoo.com' },
  { code: 'ISP-003', name: 'PT. Biznet Indo',              contact_name: 'Agus Pratama',  contact_phone: '08123456013', contact_email: 'noc@biznet.id' },
];

const POPS = [
  { code: 'POP-JKT-01', name: 'POP Jakarta Pusat',    city: 'Jakarta',  province: 'DKI Jakarta',  lat: -6.2088,  lng: 106.8456 },
  { code: 'POP-BDG-01', name: 'POP Bandung Dago',     city: 'Bandung',  province: 'Jawa Barat',   lat: -6.9175,  lng: 107.6191 },
  { code: 'POP-SBY-01', name: 'POP Surabaya Gubeng',  city: 'Surabaya', province: 'Jawa Timur',   lat: -7.2575,  lng: 112.7521 },
  { code: 'POP-SMG-01', name: 'POP Semarang',        city: 'Semarang', province: 'Jawa Tengah',  lat: -6.9667,  lng: 110.4167 },
];

const MS_SPLITTERS = [
  { code: 'ONT-0001', type: 'ONT',      name: 'ONT Huawei HG8245H',    pop: 'POP-JKT-01', mac_address: '48:1F:3B:AA:00:01', serial_number: 'HW-8245-0001' },
  { code: 'ONT-0002', type: 'ONT',      name: 'ONT ZTE F670L',         pop: 'POP-BDG-01', mac_address: 'C0:B5:E2:AA:00:02', serial_number: 'ZT-670L-0002' },
  { code: 'SPL-0001', type: 'Splitter', name: 'Splitter 1:8 PLC',      pop: 'POP-JKT-01', mac_address: null,                serial_number: 'SPL-08-0001' },
  { code: 'SPL-0002', type: 'Splitter', name: 'Splitter 1:16 Optical', pop: 'POP-SBY-01', mac_address: null,                serial_number: 'SPL-16-0002' },
  { code: 'MS-0001',  type: 'MS',       name: 'Metro Ethernet Switch', pop: 'POP-SMG-01', mac_address: '00:1B:21:AA:00:03', serial_number: 'MS-ME-0001' },
  { code: 'CPE-0001', type: 'CPE',      name: 'CPE Router Outdoor',   pop: 'POP-JKT-01', mac_address: '74:AC:B9:AA:00:04', serial_number: 'CPE-OD-0001' },
];

const LINKS = [
  { code: 'LNK-0001', link_name: 'Jakarta–Bandung Backbone 1',  isp: 'ISP-002', customer: 'CUST-001', cid: 'CID-JKT-BDG-001', bandwidth: '1 Gbps',  media_type: 'Fiber Optic', site_a: 'POP Jakarta Pusat', site_b: 'POP Bandung Dago' },
  { code: 'LNK-0002', link_name: 'Jakarta–Surabaya Access 12',  isp: 'ISP-001', customer: 'CUST-002', cid: 'CID-JKT-SBY-012', bandwidth: '500 Mbps', media_type: 'Fiber Optic', site_a: 'POP Jakarta Pusat', site_b: 'POP Surabaya Gubeng' },
  { code: 'LNK-0003', link_name: 'Semarang Metro Ring',        isp: 'ISP-003', customer: 'CUST-003', cid: 'CID-SMG-RING-01', bandwidth: '2 Gbps',  media_type: 'DWDM',       site_a: 'POP Semarang',      site_b: 'POP Jakarta Pusat' },
  { code: 'LNK-0004', link_name: 'Bandung–Semarang Fishbone', isp: 'ISP-002', customer: 'CUST-001', cid: 'CID-BDG-SMG-007', bandwidth: '1 Gbps',  media_type: 'Fiber Optic', site_a: 'POP Bandung Dago',   site_b: 'POP Semarang' },
];

async function seed(conn) {
  console.log('  → seeding master data');

  for (const s of SERVICE_TYPES) {
    await conn.query(
      `INSERT INTO m_service_type (code, name, description, sort_order)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), sort_order=VALUES(sort_order)`,
      [s.code, s.name, s.description, s.sort_order]
    );
  }

  for (const p of PRIORITIES) {
    await conn.query(
      `INSERT INTO m_priority (code, name, level, response_hours, resolution_hours, color, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), level=VALUES(level),
         response_hours=VALUES(response_hours), resolution_hours=VALUES(resolution_hours),
         color=VALUES(color), sort_order=VALUES(sort_order)`,
      [p.code, p.name, p.level, p.response_hours, p.resolution_hours, p.color, p.sort_order]
    );
  }

  for (const c of CHANNELS) {
    await conn.query(
      `INSERT INTO m_report_channel (code, name, icon, sort_order)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), icon=VALUES(icon), sort_order=VALUES(sort_order)`,
      [c.code, c.name, c.icon, c.sort_order]
    );
  }

  for (const c of CUSTOMERS) {
    await conn.query(
      `INSERT INTO m_customer (code, name, contact_name, contact_phone, contact_email)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), contact_name=VALUES(contact_name),
         contact_phone=VALUES(contact_phone), contact_email=VALUES(contact_email)`,
      [c.code, c.name, c.contact_name, c.contact_phone, c.contact_email]
    );
  }

  for (const i of ISPS) {
    await conn.query(
      `INSERT INTO m_isp (code, name, contact_name, contact_phone, contact_email)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), contact_name=VALUES(contact_name),
         contact_phone=VALUES(contact_phone), contact_email=VALUES(contact_email)`,
      [i.code, i.name, i.contact_name, i.contact_phone, i.contact_email]
    );
  }

  for (const p of POPS) {
    await conn.query(
      `INSERT INTO m_pop (code, name, city, province, lat, lng)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), city=VALUES(city), province=VALUES(province),
         lat=VALUES(lat), lng=VALUES(lng)`,
      [p.code, p.name, p.city, p.province, p.lat, p.lng]
    );
  }

  // Resolve POP codes to ids for MS/Splitter + Links
  // NOTE: mysql2's query() resolves to [rows, fields] — destructure the rows.
  const popIds = new Map();
  {
    const [rows] = await conn.query('SELECT id, code FROM m_pop');
    for (const row of rows) popIds.set(row.code, row.id);
  }

  for (const m of MS_SPLITTERS) {
    await conn.query(
      `INSERT INTO m_ms_splitter (code, type, name, pop_id, mac_address, serial_number)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE type=VALUES(type), name=VALUES(name), pop_id=VALUES(pop_id),
         mac_address=VALUES(mac_address), serial_number=VALUES(serial_number)`,
      [m.code, m.type, m.name, popIds.get(m.pop) ?? null, m.mac_address, m.serial_number]
    );
  }

  const ispIds = new Map();
  {
    const [rows] = await conn.query('SELECT id, code FROM m_isp');
    for (const row of rows) ispIds.set(row.code, row.id);
  }
  const custIds = new Map();
  {
    const [rows] = await conn.query('SELECT id, code FROM m_customer');
    for (const row of rows) custIds.set(row.code, row.id);
  }

  for (const l of LINKS) {
    await conn.query(
      `INSERT INTO m_link (code, link_name, isp_id, customer_id, cid, bandwidth, media_type, site_a, site_b)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE link_name=VALUES(link_name), isp_id=VALUES(isp_id),
         customer_id=VALUES(customer_id), cid=VALUES(cid), bandwidth=VALUES(bandwidth),
         media_type=VALUES(media_type), site_a=VALUES(site_a), site_b=VALUES(site_b)`,
      [l.code, l.link_name, ispIds.get(l.isp) ?? null, custIds.get(l.customer) ?? null,
       l.cid, l.bandwidth, l.media_type, l.site_a, l.site_b]
    );
  }

  // --- SLA policies: every service type × every priority ---
  console.log('  → seeding SLA policies (service × priority)');
  const [svcRows] = await conn.query('SELECT id, code FROM m_service_type');
  const [priRows] = await conn.query('SELECT id, code, response_hours, resolution_hours FROM m_priority');
  // (mysql2 resolves to [rows, fields] — svcRows/priRows are already the row arrays.)

  // Service-specific multipliers: critical infrastructure gets tighter clocks.
  const multiplier = { ACCESS: 1, BACKBONE: 0.75, FISHBONE: 0.85, OTHER: 1 };
  const round2 = (n) => Math.max(1, Math.round(n * 100) / 100);

  for (const svc of svcRows) {
    const mult = multiplier[svc.code] ?? 1;
    for (const pri of priRows) {
      const resp = round2(Number(pri.response_hours) * mult);
      const reso = round2(Number(pri.resolution_hours) * mult);
      const esc = round2(reso / 2);
      await conn.query(
        `INSERT INTO m_sla_policy (name, service_type_id, priority_id, response_hours, resolution_hours, escalation_hours, pause_on_customer_wait, business_hours_only, description)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), response_hours=VALUES(response_hours),
           resolution_hours=VALUES(resolution_hours), escalation_hours=VALUES(escalation_hours),
           pause_on_customer_wait=VALUES(pause_on_customer_wait), business_hours_only=VALUES(business_hours_only),
           description=VALUES(description)`,
        [
          `SLA ${svc.code} / ${pri.code}`,
          svc.id, pri.id, resp, reso, esc,
          `Response ${resp}h, resolve ${reso}h for ${svc.code} at ${pri.code} priority`,
        ]
      );
    }
  }

  // --- Default admin user ---
  console.log('  → seeding users');
  const hash = await bcrypt.hash('admin123', config.auth.bcryptRounds);
  await conn.query(
    `INSERT INTO users (username, full_name, email, password_hash, role, department)
     VALUES (?, ?, ?, ?, 'admin', 'NOC')
     ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role=VALUES(role)`,
    ['admin', 'Administrator NOC', 'admin@synoc.local', hash]
  );

  const nocHash = await bcrypt.hash('noc123', config.auth.bcryptRounds);
  await conn.query(
    `INSERT INTO users (username, full_name, email, password_hash, role, department)
     VALUES (?, ?, ?, ?, 'noc', 'NOC')
     ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role=VALUES(role)`,
    ['noc', 'NOC Operator', 'noc@synoc.local', nocHash]
  );

  const engHash = await bcrypt.hash('engineer123', config.auth.bcryptRounds);
  await conn.query(
    `INSERT INTO users (username, full_name, email, password_hash, role, department)
     VALUES (?, ?, ?, ?, 'engineer', 'Field Engineering')
     ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role=VALUES(role)`,
    ['engineer', 'Field Engineer', 'engineer@synoc.local', engHash]
  );
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`SYNOC NOC Helpdesk — database bootstrap${RESET ? ' (RESET)' : ''}`);
  const dbName = config.db.database;
  const conn = await rootConnection();

  try {
    if (RESET) {
      await dropAll(conn, dbName);
    }

    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    console.log(`  → database \`${dbName}\` ready`);
    await conn.query(`USE \`${dbName}\``);

    await applySchema(conn);
    await seed(conn);

    console.log('\n✓ Done. Credentials:');
    console.log('   admin   / admin123    (administrator)');
    console.log('   noc     / noc123      (NOC operator)');
    console.log('   engineer/ engineer123 (field engineer)');
  } catch (err) {
    console.error('\n✗ Bootstrap failed:', err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
