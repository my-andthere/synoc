/**
 * Test: field "Jam" pada kolom Catatan di popup detail tiket.
 *
 * Jalankan:
 *   node db/test-ticket-note-time.js http://127.0.0.1:8000
 *
 * Skenario:
 *   1. Catatan dengan jam pilihan -> `ticket_events.created_at` memakai jam itu
 *   2. Jam kosong -> memakai waktu server (NOW)
 *   3. Jam tidak valid -> 400
 *   4. Perubahan status juga memakai jam yang dipilih
 *   5. Timeline terurut benar & mengembalikan jam yang sama
 *   6. Tiket uji dihapus -> tidak ada sisa data
 *
 * Verifikasi memakai NILAI MENTAH di database, karena yang diuji adalah
 * "jam yang dipilih user tersimpan apa adanya" pada konvensi waktu lokal.
 */
import { query, queryOne, execute } from '../src/db.js';

const BASE = (process.argv[2] || 'http://127.0.0.1:8000').replace(/\/$/, '');

let pass = 0;
let fail = 0;

function check(ok, label, extra = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  ✗ ${label}${extra ? ' — ' + extra : ''}`); }
}

async function api(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { status: res.status, data };
}

/**
 * Ubah nilai apa pun (Date mysql2 / string ISO / string MySQL) menjadi Date
 * pada zona waktu lokal.
 *
 * - Date instance  : sudah jadi instan waktu -> dipakai langsung.
 * - string ISO (Z) : instants UTC -> `new Date()` mengonversi ke lokal.
 * - string MySQL   : "YYYY-MM-DD HH:MM:SS" (wall clock lokal) -> dibaca
 *                    sebagai waktu lokal.
 */
function toLocalDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value);
  // String dengan penanda zona waktu (Z / +07:00) adalah instan absolut ->
  // biarkan `new Date()` yang mengonversi ke waktu lokal.
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // "YYYY-MM-DD HH:MM:SS" tanpa zona waktu = wall clock lokal.
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format Date menjadi "YYYY-MM-DD HH:MM:SS" (waktu lokal). */
function fmtLocal(d) {
  if (!d) return '-';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
       + `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** "HH:MM" -> { h, m } */
function parseHm(value) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  return m ? { h: Number(m[1]), m: Number(m[2]) } : null;
}

(async () => {
  console.log(`\n=== Test Jam pada Catatan (Popup Detail Tiket) ===`);
  console.log(`Target: ${BASE}\n`);

  const login = await api('/auth/login', {
    method: 'POST', body: { username: 'admin', password: 'admin123' },
  });
  if (login.status !== 200) {
    console.log('  ✗ Login gagal — hentikan uji');
    process.exit(1);
  }
  const token = login.data.token;

  const svc = await api('/master/service_type/options', { token });
  const pri = await api('/master/priority/options', { token });
  const serviceTypeId = svc.data.data[0].id;
  const priorityId = pri.data.data[0].id;

  // --- tiket uji ---
  const created = await api('/tickets', {
    method: 'POST',
    token,
    body: {
      title: 'Uji Jam Catatan',
      description: 'tiket sementara untuk pengujian jam pada catatan',
      service_type_id: serviceTypeId,
      priority_id: priorityId,
      regional: 'CENTRAL',
    },
  });
  check(created.status === 201, 'tiket uji dibuat', `HTTP ${created.status}`);
  if (created.status !== 201) {
    console.log(`     ${JSON.stringify(created.data)}`);
    process.exit(1);
  }
  const ticketId = created.data.data.id;

  // --- 1. catatan dengan jam pilihan ---
  const picked = '07:45';
  const hm = parseHm(picked);
  const r1 = await api(`/tickets/${ticketId}/events`, {
    method: 'POST',
    token,
    body: { note: 'Catatan dengan jam khusus', event_type: 'note', occurred_time: picked },
  });
  check(r1.status === 201, 'catatan dengan jam dikirim', `HTTP ${r1.status}`);

  const ev = await queryOne(
    `SELECT * FROM ticket_events
      WHERE ticket_id = ? AND note = 'Catatan dengan jam khusus'
      ORDER BY id DESC LIMIT 1`,
    [ticketId]
  );
  const evAt = ev ? toLocalDate(ev.created_at) : null;
  check(
    evAt !== null
      && evAt.getHours() === hm.h
      && evAt.getMinutes() === hm.m
      && evAt.getDate() === new Date().getDate(),
    'created_at event memakai jam yang dipilih',
    fmtLocal(evAt)
  );

  // --- 2. jam kosong -> waktu server ---
  const r2 = await api(`/tickets/${ticketId}/events`, {
    method: 'POST',
    token,
    body: { note: 'Catatan tanpa jam', event_type: 'note' },
  });
  check(r2.status === 201, 'catatan tanpa jam diterima', `HTTP ${r2.status}`);
  const ev2 = await queryOne(
    `SELECT * FROM ticket_events
      WHERE ticket_id = ? AND note = 'Catatan tanpa jam'
      ORDER BY id DESC LIMIT 1`,
    [ticketId]
  );
  const ev2At = ev2 ? toLocalDate(ev2.created_at) : null;
  const drift = ev2At ? Math.abs(Date.now() - ev2At.getTime()) : Infinity;
  check(drift < 5 * 60 * 1000, 'jam kosong memakai waktu server', fmtLocal(ev2At));

  // --- 3. jam tidak valid -> 400 ---
  for (const bad of ['25:99', 'abc', '7:5', '12:60']) {
    const r = await api(`/tickets/${ticketId}/events`, {
      method: 'POST',
      token,
      body: { note: 'Catatan jam ngawur', event_type: 'note', occurred_time: bad },
    });
    check(r.status === 400, `jam tidak valid ditolak: "${bad}"`, `HTTP ${r.status}`);
  }
  const leftovers = await query(
    `SELECT COUNT(*) AS c FROM ticket_events
      WHERE ticket_id = ? AND note = 'Catatan jam ngawur'`,
    [ticketId]
  );
  check(Number(leftovers[0].c) === 0, 'catatan tidak valid tidak tersimpan');

  // --- 4. perubahan status memakai jam yang dipilih ---
  const r4 = await api(`/tickets/${ticketId}/status`, {
    method: 'POST',
    token,
    body: { status: 'in_progress', note: 'Dikerjakan', occurred_time: '09:15' },
  });
  check(r4.status === 200, 'status diubah dengan jam', `HTTP ${r4.status}`);
  const ev4 = await queryOne(
    `SELECT * FROM ticket_events
      WHERE ticket_id = ? AND event_type = 'status_change'
      ORDER BY id DESC LIMIT 1`,
    [ticketId]
  );
  const ev4At = ev4 ? toLocalDate(ev4.created_at) : null;
  check(
    ev4At !== null && ev4At.getHours() === 9 && ev4At.getMinutes() === 15,
    'event perubahan status memakai jam yang dipilih',
    fmtLocal(ev4At)
  );

  // --- 5. timeline API mengembalikan jam yang sama ---
  const one = await api(`/tickets/${ticketId}`, { token });
  const apiEvent = (one.data.events || []).find((e) => e.note === 'Catatan dengan jam khusus');
  const apiAt = apiEvent ? toLocalDate(apiEvent.created_at) : null;
  check(
    apiAt !== null && apiAt.getHours() === hm.h && apiAt.getMinutes() === hm.m,
    'timeline API mengembalikan jam yang sama',
    fmtLocal(apiAt)
  );

  // --- 6. bersihkan ---
  const del = await api(`/tickets/${ticketId}`, { method: 'DELETE', token });
  check(del.status === 200, 'tiket uji dihapus', `HTTP ${del.status}`);
  const gone = await query('SELECT COUNT(*) AS c FROM ticket_events WHERE ticket_id = ?', [ticketId]);
  check(Number(gone[0].c) === 0, 'event tiket uji ikut terhapus');

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===\n`);
  process.exit(fail ? 1 : 0);
})();
