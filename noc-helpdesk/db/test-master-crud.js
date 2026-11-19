/**
 * SYNOC — master data CRUD regression harness.
 *
 * Exercises Create / Read / Update / Delete for every master-data resource
 * through the public HTTP API (the same endpoints the UI uses).
 *
 *   node db/test-master-crud.js                       # default http://localhost:8000
 *   node db/test-master-crud.js http://localhost:4310
 *
 * Every record created by this script is removed again in the cleanup phase,
 * so the database is left exactly as it was found.
 */
import { query, execute } from '../src/db.js';

const BASE = (process.argv[2] || 'http://localhost:8000').replace(/\/$/, '');
const API = `${BASE}/helpdesk/api`;

let token = null;
const results = [];

/** Physical table + searchable columns per resource (mirrors src/routes/master.js). */
const TABLE_OF = {
  service_type: { table: 'm_service_type', nameCol: 'name', hasCode: true },
  priority:     { table: 'm_priority',     nameCol: 'name', hasCode: true },
  channel:      { table: 'm_report_channel', nameCol: 'name', hasCode: true },
  branch:       { table: 'm_branch',        nameCol: 'name', hasCode: true },
  pic:          { table: 'm_pic',          nameCol: 'name', hasCode: true },
  customer:     { table: 'm_customer',     nameCol: 'name', hasCode: true },
  isp:          { table: 'm_isp',          nameCol: 'name', hasCode: true },
  pop:          { table: 'm_pop',          nameCol: 'name', hasCode: true },
  ms_splitter:  { table: 'm_ms_splitter',  nameCol: 'name', hasCode: true },
  link:         { table: 'm_link',         nameCol: 'link_name', hasCode: true },
  sla_policy:   { table: 'm_sla_policy',   nameCol: 'name', hasCode: false },
};

/** Payload generator per resource — mirrors the UI form fields. */
const RESOURCES = [
  {
    key: 'service_type', label: 'Jenis Layanan',
    requiredFields: ['code', 'name'],
    create: (tag) => ({ code: `TST${tag}`, name: `Tipe Uji ${tag}`, description: 'uji crud', sort_order: 99 }),
    update: { name: 'Tipe Uji Edit' },
    match: (row, tag) => row.code === `TST${tag}`,
  },
  {
    key: 'priority', label: 'Priority',
    requiredFields: ['code', 'name'],
    create: (tag) => ({
      code: `TST${tag}`, name: `Prio Uji ${tag}`, level: 9,
      response_hours: 3, resolution_hours: 6, color: '#123456', sort_order: 99,
    }),
    update: { name: 'Prio Uji Edit', resolution_hours: 12 },
    match: (row, tag) => row.code === `TST${tag}`,
  },
  {
    key: 'channel', label: 'Kanal Pelaporan',
    requiredFields: ['code', 'name'],
    create: (tag) => ({ code: `TST${tag}`, name: `Kanal Uji ${tag}`, icon: 'bi-pencil-square', sort_order: 99 }),
    update: { name: 'Kanal Uji Edit' },
    match: (row, tag) => row.code === `TST${tag}`,
  },
  {
    key: 'branch', label: 'Cabang',
    requiredFields: ['code', 'name'],
    create: (tag) => ({
      code: `TST${tag}`, name: `Cabang Uji ${tag}`, regional: 'WEST',
      city: 'Uji City', province: 'Uji Province', phone: '08120000126',
      manager: 'Tester', address: 'Alamat uji',
    }),
    update: { name: 'Cabang Uji Edit', regional: 'EAST' },
    match: (row, tag) => row.code === `TST${tag}`,
  },
  {
    key: 'pic', label: 'PIC',
    requiredFields: ['code', 'name'],
    create: (tag) => ({
      code: `TST${tag}`, name: `PIC Uji ${tag}`, position: 'QA Tester',
      department: 'NOC', phone: '08120000123', email: `pic${tag}@synoc.local`, regional: 'WEST',
    }),
    update: { name: 'PIC Uji Edit', position: 'QA Tester Edit', regional: 'EAST' },
    match: (row, tag) => row.code === `TST${tag}`,
  },
  {
    key: 'customer', label: 'Customer',
    requiredFields: ['code', 'name'],
    create: (tag) => ({
      code: `TST${tag}`, name: `Cust Uji ${tag}`, contact_name: 'Tester',
      contact_phone: '08120000124', contact_email: `cust${tag}@synoc.local`, address: 'Alamat uji',
    }),
    update: { name: 'Cust Uji Edit' },
    match: (row, tag) => row.code === `TST${tag}`,
  },
  {
    key: 'isp', label: 'ISP',
    requiredFields: ['code', 'name'],
    create: (tag) => ({
      code: `TST${tag}`, name: `ISP Uji ${tag}`, contact_name: 'Tester',
      contact_phone: '08120000125', contact_email: `isp${tag}@synoc.local`,
    }),
    update: { name: 'ISP Uji Edit' },
    match: (row, tag) => row.code === `TST${tag}`,
  },
  {
    key: 'pop', label: 'POP',
    requiredFields: ['code', 'name'],
    create: (tag) => ({
      code: `TST${tag}`, name: `POP Uji ${tag}`, city: 'Uji City',
      province: 'Uji Province', address: 'Alamat uji', lat: -6.5, lng: 106.5,
    }),
    update: { name: 'POP Uji Edit', city: 'Kota Edit' },
    match: (row, tag) => row.code === `TST${tag}`,
  },
  {
    key: 'ms_splitter', label: 'MS / Splitter',
    requiredFields: ['code', 'name'],
    create: (tag, ctx) => ({
      code: `TST${tag}`, type: 'ONT', name: `ONT Uji ${tag}`,
      pop_id: ctx.popId ?? null, mac_address: 'AA:BB:CC:DD:EE:FF', serial_number: `SN-UJI-${tag}`,
      status: 'active',
    }),
    update: { name: 'ONT Uji Edit', status: 'reserved' },
    match: (row, tag) => row.code === `TST${tag}`,
  },
  {
    key: 'link', label: 'Link',
    requiredFields: ['code', 'link_name'],
    create: (tag, ctx) => ({
      code: `TST${tag}`, link_name: `Link Uji ${tag}`,
      isp_id: ctx.ispId ?? null, customer_id: ctx.customerId ?? null,
      cid: `CID-UJI-${tag}`, bandwidth: '100 Mbps', media_type: 'Fiber Optic',
      site_a: 'Site A', site_b: 'Site B',
    }),
    update: { link_name: 'Link Uji Edit', bandwidth: '200 Mbps' },
    match: (row, tag) => row.code === `TST${tag}`,
  },
  {
    key: 'sla_policy', label: 'Kebijakan SLA',
    requiredFields: ['name'],
    create: (tag, ctx) => ({
      name: `SLA Uji ${tag}`, service_type_id: ctx.tmpServiceTypeId, priority_id: ctx.tmpPriorityId,
      response_hours: 5, resolution_hours: 10, escalation_hours: 2,
      pause_on_customer_wait: 1, business_hours_only: 0, description: 'uji crud',
    }),
    update: { name: 'SLA Uji Edit', resolution_hours: 20 },
    match: (row, tag) => row.name === `SLA Uji ${tag}`,
  },
];

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  return { status: res.status, data };
}

function check(resource, step, ok, detail = '') {
  results.push({ resource, step, ok, detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${resource} — ${step}${detail ? ` (${detail})` : ''}`);
  return ok;
}

/**
 * Compare a persisted value with the value we sent.
 * DECIMAL columns come back as "12.00" while we sent 12, so numeric
 * values are compared numerically instead of as strings.
 */
function sameValue(actual, expected) {
  if (actual === null || actual === undefined) return expected === null || expected === undefined;
  const a = Number(actual);
  const e = Number(expected);
  if (Number.isFinite(a) && Number.isFinite(e)) return Math.abs(a - e) < 1e-9;
  return String(actual) === String(expected);
}

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

/** Master data uses soft delete (is_active = 0), so rows survive a DELETE. */
async function hardDelete(key, id) {
  const meta = TABLE_OF[key];
  if (!meta || !id) return;
  await execute(`DELETE FROM \`${meta.table}\` WHERE id = ?`, [id]);
}

/**
 * Precise cleanup patterns.
 * Only rows created by this harness may be removed — never real data.
 */
const CLEANUP_PATTERNS = {
  service_type: ["`code` LIKE 'TST%'", "`name` LIKE 'Tipe Uji%'"],
  priority:     ["`code` LIKE 'TST%'", "`name` LIKE 'Prio Uji%'"],
  channel:      ["`code` LIKE 'TST%'", "`name` LIKE 'Kanal Uji%'"],
  branch:       ["`code` LIKE 'TST%'", "`name` LIKE 'Cabang Uji%'"],
  pic:          ["`code` LIKE 'TST%'", "`name` LIKE 'PIC Uji%'"],
  customer:     ["`code` LIKE 'TST%'", "`name` LIKE 'Cust Uji%'"],
  isp:          ["`code` LIKE 'TST%'", "`name` LIKE 'ISP Uji%'"],
  pop:          ["`code` LIKE 'TST%'", "`name` LIKE 'POP Uji%'"],
  ms_splitter:  ["`code` LIKE 'TST%'", "`name` LIKE 'ONT Uji%'"],
  link:         ["`code` LIKE 'TST%'", "`link_name` LIKE 'Link Uji%'"],
  sla_policy:   ["`name` LIKE 'SLA Uji%'"],
};

/** Remove leftovers from a previous aborted run. */
async function cleanupLeftovers() {
  for (const [key, meta] of Object.entries(TABLE_OF)) {
    const clauses = CLEANUP_PATTERNS[key] || [];
    if (!clauses.length) continue;
    await execute(
      `DELETE FROM \`${meta.table}\` WHERE ${clauses.join(' OR ')}`
    );
  }
}

// ---------------------------------------------------------------------------
// Test phases
// ---------------------------------------------------------------------------

async function login() {
  const res = await api('/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin123' },
  });
  if (res.status !== 200 || !res.data?.token) {
    throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.data)}`);
  }
  token = res.data.token;
  console.log(`✓ Login sebagai ${res.data.user.username} (${res.data.user.role})\n`);
}

/** FK targets used by other resources (must exist and stay active). */
async function buildContext(tag) {
  const [svc, pri, pop, isp, cust] = await Promise.all([
    api('/master/service_type/options'),
    api('/master/priority/options'),
    api('/master/pop/options'),
    api('/master/isp/options'),
    api('/master/customer/options'),
  ]);

  // `m_sla_policy` is UNIQUE(service_type_id, priority_id) and every
  // existing combination is already taken by the 16 seeded policies.
  // Create a throw-away service type + priority so the SLA test can
  // insert a genuinely new row.
  const tmpSvc = await api('/master/service_type', {
    method: 'POST',
    body: { code: `TST${tag}S`, name: `Tipe Uji SLA ${tag}`, sort_order: 98 },
  });
  const tmpPri = await api('/master/priority', {
    method: 'POST',
    body: {
      code: `TST${tag}P`, name: `Prio Uji SLA ${tag}`, level: 8,
      response_hours: 2, resolution_hours: 4, color: '#0f172a', sort_order: 98,
    },
  });

  return {
    serviceTypeId: svc.data?.data?.[0]?.id,
    priorityId: pri.data?.data?.[0]?.id,
    popId: pop.data?.data?.[0]?.id,
    ispId: isp.data?.data?.[0]?.id,
    customerId: cust.data?.data?.[0]?.id,
    tmpServiceTypeId: tmpSvc.data?.data?.id,
    tmpPriorityId: tmpPri.data?.data?.id,
  };
}

/** Core CRUD cycle for one resource. */
async function runCrud(def, tag, ctx) {
  const key = def.key;

  // --- CREATE ---
  const payload = def.create(tag, ctx);
  const created = await api(`/master/${key}`, { method: 'POST', body: payload });
  if (!check(key, 'CREATE', created.status === 201,
    `HTTP ${created.status}${created.data?.error ? ` ${created.data.error}` : ''}`)) {
    return;
  }
  const id = created.data?.data?.id;
  check(key, 'CREATE → id terambil', Boolean(id), `id=${id}`);

  // --- DUPLICATE guard (row masih ada → harus ditolak) ---
  const dup = await api(`/master/${key}`, { method: 'POST', body: def.create(tag, ctx) });
  check(key, 'CREATE duplikat ditolak (baris masih ada)', dup.status === 409, `HTTP ${dup.status}`);

  // --- READ single ---
  const one = await api(`/master/${key}/${id}`);
  check(key, 'READ one', one.status === 200 && one.data?.data?.id === id, `HTTP ${one.status}`);

  // --- READ list ---
  const list = await api(`/master/${key}`);
  const found = (list.data?.data || []).some((r) => def.match(r, tag));
  check(key, 'READ list berisi data baru', list.status === 200 && found,
    `HTTP ${list.status}, ${list.data?.count} baris`);

  // --- READ options (dropdown form) ---
  const opt = await api(`/master/${key}/options`);
  const optRows = opt.data?.data || [];
  const optHasNew = optRows.some((r) => String(r.id) === String(id));
  const optLabelOk = optRows.every((r) => r.label !== null && r.label !== undefined && r.label !== '');
  check(key, 'READ options (dropdown)', opt.status === 200 && optRows.length > 0 && optLabelOk,
    `HTTP ${opt.status}, ${optRows.length} opsi, label valid=${optLabelOk}`);
  check(key, 'READ options memuat data baru', optHasNew);

  // --- READ search ---
  const search = await api(`/master/${key}?search=${encodeURIComponent(tag)}`);
  const searchOk = search.status === 200
    && (search.data?.data || []).some((r) => def.match(r, tag));
  check(key, 'READ search', searchOk, `HTTP ${search.status}`);

  // --- UPDATE ---
  const updated = await api(`/master/${key}/${id}`, { method: 'PUT', body: def.update });
  check(key, 'UPDATE', updated.status === 200,
    `HTTP ${updated.status}${updated.data?.error ? ` ${updated.data.error}` : ''}`);

  // --- UPDATE persisted? ---
  const afterUpdate = await api(`/master/${key}/${id}`);
  const persisted = Object.entries(def.update).every(
    ([k, v]) => sameValue(afterUpdate.data?.data?.[k], v)
  );
  check(key, 'UPDATE tersimpan di DB', persisted,
    Object.entries(def.update).map(([k]) => `${k}=${afterUpdate.data?.data?.[k]}`).join(', '));

  // --- DELETE ---
  const deleted = await api(`/master/${key}/${id}`, { method: 'DELETE' });
  check(key, 'DELETE', deleted.status === 200,
    `HTTP ${deleted.status} ${deleted.data?.message || deleted.data?.error || ''}`);

  // --- DELETE benar-benar hilang dari DB ---
  const afterDelete = await api(`/master/${key}/${id}`);
  check(key, 'DELETE → baris hilang dari DB (404)', afterDelete.status === 404,
    `HTTP ${afterDelete.status}`);

  // --- DELETE → hilang dari daftar ---
  const listAfter = await api(`/master/${key}`);
  check(key, 'DELETE → hilang dari list',
    listAfter.status === 200 && !(listAfter.data?.data || []).some((r) => def.match(r, tag)),
    `${listAfter.data?.count} baris`);

  // --- DELETE → hilang dari options (dropdown) ---
  const optAfter = await api(`/master/${key}/options`);
  check(key, 'DELETE → hilang dari options (dropdown)',
    optAfter.status === 200 && !optAfter.data?.data?.some((r) => String(r.id) === String(id)),
    `${optAfter.data?.data?.length ?? 0} opsi`);

  // --- Kode yang sama boleh dipakai lagi (bukti baris benar-benar hilang) ---
  const reuse = await api(`/master/${key}`, { method: 'POST', body: def.create(tag, ctx) });
  check(key, 'CREATE ulang dengan kode sama diizinkan (bukti row hilang)',
    reuse.status === 201, `HTTP ${reuse.status}`);
  const reuseId = reuse.data?.data?.id;
  await api(`/master/${key}/${reuseId}`, { method: 'DELETE' });

  // --- VALIDATION guard ---
  const bad = await api(`/master/${key}`, { method: 'POST', body: {} });
  check(key, 'CREATE tanpa field ditolak', bad.status === 400, `HTTP ${bad.status}`);

  // --- Kolom NOT NULL tanpa default harus ditolak dengan pesan jelas ---
  const required = await api(`/master/${key}`, {
    method: 'POST',
    body: Object.fromEntries((def.requiredFields || []).map((k) => [k, ''])),
  });
  check(key, 'CREATE kolom wajib kosong → 400 (bukan 500)',
    required.status === 400, `HTTP ${required.status}`);

  // --- CLEANUP (baris sudah terhapus oleh DELETE) ---
  await hardDelete(key, id);
  const gone = await api(`/master/${key}/${id}`);
  check(key, 'CLEANUP baris hilang', gone.status === 404, `HTTP ${gone.status}`);
}

async function main() {
  console.log('SYNOC — uji CRUD master data');
  console.log(`  target: ${API}\n`);

  await cleanupLeftovers();
  await login();

  const tag = String(Date.now()).slice(-6);
  const ctx = await buildContext(tag);
  for (const def of RESOURCES) {
    console.log(`\n── ${def.label} (${def.key}) ──`);
    try {
      await runCrud(def, tag, ctx);
    } catch (err) {
      check(def.key, 'CRASH', false, err.message);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n════════════════════════════════════════');
  console.log(`Total pemeriksaan : ${results.length}`);
  console.log(`Berhasil          : ${results.length - failed.length}`);
  console.log(`Gagal             : ${failed.length}`);
  if (failed.length) {
    console.log('\nPemeriksaan yang gagal:');
    failed.forEach((f) => console.log(`  ✗ ${f.resource} — ${f.step} ${f.detail}`));
  }
  console.log('════════════════════════════════════════');

  await cleanupLeftovers();
  const leftovers = await query(
    `SELECT (SELECT COUNT(*) FROM m_pic WHERE code LIKE 'TST%') AS pic,
            (SELECT COUNT(*) FROM m_link WHERE code LIKE 'TST%') AS link,
            (SELECT COUNT(*) FROM m_sla_policy WHERE name LIKE '% Uji%') AS sla`
  );
  console.log(`\nSisa baris uji → m_pic=${leftovers[0].pic} m_link=${leftovers[0].link} m_sla_policy=${leftovers[0].sla}`);

  process.exitCode = failed.length ? 1 : 0;
}

main()
  .catch((err) => {
    console.error('\n✗ Harness gagal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await cleanupLeftovers(); } catch { /* ignore */ }
    process.exit(process.exitCode);
  });
