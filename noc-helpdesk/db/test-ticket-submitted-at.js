/**
 * Test: tanggal & jam pengajuan pada Ticket Baru.
 *
 * Jalankan:
 *   node db/test-ticket-submitted-at.js http://127.0.0.1:8000
 *
 * Skenario:
 *   1. Tiket dibuat dengan tanggal/jam pengajuan pilihan -> created_at sesuai
 *   2. Nomor tiket mengikuti periode (tahun/bulan) waktu pengajuan
 *   3. SLA dihitung mulai dari waktu pengajuan
 *   4. Format salah -> 400 (tanggal saja / jam saja / string ngawur)
 *   5. Tanpa tanggal/jam -> memakai waktu server
 *   6. Tiket uji dihapus -> tidak ada sisa data
 *
 * Verifikasi dilakukan terhadap NILAI MENTAH di database (bukan hasil
 * serialisasi API), karena yang diuji adalah "jam yang dipilih user tersimpan
 * apa adanya" pada konvensi waktu lokal.
 */
import { queryOne } from '../src/db.js';

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

/** Nilai mentah `created_at` di database (wall clock lokal). */
async function rawCreatedAt(ticketId) {
  const row = await queryOne('SELECT created_at FROM tickets WHERE id = ?', [ticketId]);
  return row ? toLocalDate(row.created_at) : null;
}

(async () => {
  console.log(`\n=== Test Tanggal & Jam Pengajuan (Ticket Baru) ===`);
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

  const created = [];

  // --- 1. tiket dengan tanggal & jam pengajuan pilihan ---
  const pickedDate = '2026-10-05';
  const pickedTime = '14:35';
  const t1 = await api('/tickets', {
    method: 'POST',
    token,
    body: {
      title: 'Uji Tanggal Jam Pengajuan',
      description: 'tiket sementara untuk pengujian tanggal & jam pengajuan',
      service_type_id: serviceTypeId,
      priority_id: priorityId,
      regional: 'CENTRAL',
      submitted_date: pickedDate,
      submitted_time: pickedTime,
    },
  });
  check(t1.status === 201, 'tiket dibuat dengan tanggal & jam pengajuan', `HTTP ${t1.status}`);
  if (t1.status !== 201) {
    console.log(`     ${JSON.stringify(t1.data)}`);
    process.exit(1);
  }
  created.push(t1.data.data.id);

  const createdAt = await rawCreatedAt(t1.data.data.id);
  check(
    createdAt !== null
      && createdAt.getFullYear() === 2026
      && createdAt.getMonth() === 9
      && createdAt.getDate() === 5
      && createdAt.getHours() === 14
      && createdAt.getMinutes() === 35,
    'created_at di DB memakai tanggal & jam pengajuan yang dipilih',
    fmtLocal(createdAt)
  );

  // --- 2. nomor tiket mengikuti periode waktu pengajuan ---
  check(
    String(t1.data.data.ticket_number).startsWith('NOCCENTRAL/2026/10/'),
    'nomor tiket mengikuti periode waktu pengajuan',
    t1.data.data.ticket_number
  );

  // --- 3. SLA dihitung dari waktu pengajuan ---
  const slaRow = await queryOne(
    'SELECT resolution_due_at FROM ticket_sla WHERE ticket_id = ?', [t1.data.data.id]
  );
  const due = slaRow ? toLocalDate(slaRow.resolution_due_at) : null;
  const hours = (due && createdAt) ? (due - createdAt) / 3600000 : null;
  check(
    due !== null && hours !== null && hours > 0 && hours <= 48,
    'SLA terhitung mulai dari waktu pengajuan',
    hours !== null ? `${hours} jam` : 'tidak ada'
  );

  // --- 4. input tidak valid ditolak ---
  const bad = [
    { label: 'tanggal saja', body: { submitted_date: '2026-10-05' } },
    { label: 'jam saja', body: { submitted_time: '10:00' } },
    { label: 'format tanggal salah', body: { submitted_date: '05-10-2026', submitted_time: '10:00' } },
    { label: 'format jam salah', body: { submitted_date: '2026-10-05', submitted_time: '25:99' } },
  ];
  for (const c of bad) {
    const r = await api('/tickets', {
      method: 'POST',
      token,
      body: {
        title: 'Uji Tanggal Jam Tidak Valid',
        service_type_id: serviceTypeId,
        priority_id: priorityId,
        regional: 'WEST',
        ...c.body,
      },
    });
    check(r.status === 400, `ditolak: ${c.label}`, `HTTP ${r.status}`);
  }

  // --- 5. tanpa tanggal/jam -> waktu server ---
  const t2 = await api('/tickets', {
    method: 'POST',
    token,
    body: {
      title: 'Uji Tanpa Tanggal Jam',
      description: 'tiket sementara tanpa tanggal & jam pengajuan',
      service_type_id: serviceTypeId,
      priority_id: priorityId,
      regional: 'CENTRAL',
    },
  });
  check(t2.status === 201, 'tiket dibuat tanpa tanggal & jam pengajuan', `HTTP ${t2.status}`);
  if (t2.status === 201) {
    created.push(t2.data.data.id);
    const serverAt = await rawCreatedAt(t2.data.data.id);
    const diff = serverAt ? Math.abs(Date.now() - serverAt.getTime()) : Infinity;
    check(diff < 5 * 60 * 1000, 'created_at memakai waktu server saat field kosong', fmtLocal(serverAt));
  }

  // --- 6. bersihkan tiket uji ---
  for (const id of created) {
    const del = await api(`/tickets/${id}`, { method: 'DELETE', token });
    check(del.status === 200, `tiket uji #${id} dihapus`, `HTTP ${del.status}`);
  }
  for (const id of created) {
    const chk = await api(`/tickets/${id}`, { token });
    check(chk.status === 404, `tiket uji #${id} tidak ada lagi`, `HTTP ${chk.status}`);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===\n`);
  process.exit(fail ? 1 : 0);
})();
