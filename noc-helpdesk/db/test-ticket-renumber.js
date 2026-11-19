/**
 * Test: penomoran ulang tiket ketika Regional diubah.
 *
 * Jalankan:
 *   node db/test-ticket-renumber.js http://127.0.0.1:8000
 *
 * Skenario:
 *   1. Tiket dibuat dengan regional CENTRAL -> nomor NOCCENTRAL/...
 *   2. Admin mengubah regional ke WEST       -> nomor jadi NOCWEST/...
 *   3. Timeline "tiket dibuat" mengikuti nomor baru
 *   4. User non-admin mencoba mengubah regional -> 403
 *   5. Tiket uji dihapus -> tidak ada sisa data
 */
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

const NUM = /^NOC(WEST|CENTRAL|EAST)?\/\d{4}\/\d{2}\/\d{5}$/;

(async () => {
  console.log(`\n=== Test Penomoran Ulang Tiket (Regional) ===`);
  console.log(`Target: ${BASE}\n`);

  const adminLogin = await api('/auth/login', {
    method: 'POST', body: { username: 'admin', password: 'admin123' },
  });
  const nocLogin = await api('/auth/login', {
    method: 'POST', body: { username: 'noc', password: 'noc123' },
  });
  if (adminLogin.status !== 200 || nocLogin.status !== 200) {
    console.log('  ✗ Login gagal — hentikan uji');
    process.exit(1);
  }
  const admin = adminLogin.data.token;
  const noc = nocLogin.data.token;

  const svc = await api('/master/service_type/options', { token: admin });
  const pri = await api('/master/priority/options', { token: admin });
  const serviceTypeId = svc.data.data[0].id;
  const priorityId = pri.data.data[0].id;

  // --- 1. buat tiket uji ---
  const created = await api('/tickets', {
    method: 'POST',
    token: admin,
    body: {
      title: 'Uji Penomoran Regional',
      description: 'tiket sementara untuk pengujian penomoran regional',
      service_type_id: serviceTypeId,
      priority_id: priorityId,
      regional: 'CENTRAL',
    },
  });
  check(created.status === 201, 'CREATE tiket uji', `HTTP ${created.status}`);
  if (created.status !== 201) {
    console.log(JSON.stringify(created.data));
    process.exit(1);
  }
  const id = created.data.data.id;
  const noCentral = created.data.data.ticket_number;
  check(NUM.test(noCentral), 'Nomor awal mengikuti format regional', noCentral);
  check(noCentral.startsWith('NOCCENTRAL/'), 'Nomor awal memakai prefix CENTRAL', noCentral);

  // --- 2. admin ubah regional ke WEST ---
  const toWest = await api(`/tickets/${id}`, {
    method: 'PUT', token: admin, body: { regional: 'WEST' },
  });
  check(toWest.status === 200, 'PUT regional (admin)', `HTTP ${toWest.status}`);
  const noWest = toWest.data?.data?.ticket_number;
  check(noWest?.startsWith('NOCWEST/'), 'Nomor berubah mengikuti regional baru', noWest);
  check(noWest !== noCentral, 'Nomor lama tidak dipakai lagi', `${noCentral} → ${noWest}`);
  check(noWest?.split('/').slice(0, 3).join('/') === noCentral.split('/').slice(0, 3).join('/').replace('CENTRAL', 'WEST'),
    'Periode (tahun/bulan) tetap sama', noWest);

  // --- 3. timeline ikut berubah ---
  const detail = await api(`/tickets/${id}`, { token: admin });
  const createdEvent = detail.data.events.find((e) => e.event_type === 'created');
  check(createdEvent?.to_value === noWest, 'Event "tiket dibuat" memakai nomor baru', createdEvent?.to_value);

  // --- 4. non-admin tidak boleh mengubah regional ---
  const asNoc = await api(`/tickets/${id}`, {
    method: 'PUT', token: noc, body: { regional: 'EAST' },
  });
  check(asNoc.status === 403, 'PUT regional oleh non-admin ditolak', `HTTP ${asNoc.status}`);
  const stillWest = await api(`/tickets/${id}`, { token: admin });
  check(stillWest.data.data.ticket_number === noWest, 'Data tidak berubah setelah penolakan', stillWest.data.data.ticket_number);

  // --- 5. regional tidak boleh dikosongkan ---
  const emptyRegional = await api(`/tickets/${id}`, {
    method: 'PUT', token: admin, body: { regional: '' },
  });
  check(emptyRegional.status === 400, 'Regional kosong ditolak', `HTTP ${emptyRegional.status}`);

  // --- 6. regional tidak valid ditolak ---
  const badRegional = await api(`/tickets/${id}`, {
    method: 'PUT', token: admin, body: { regional: 'NORTH' },
  });
  check(badRegional.status === 400, 'Regional tidak valid ditolak', `HTTP ${badRegional.status}`);

  // --- 7. judul tetap bisa diubah tanpa mengubah nomor ---
  const titleOnly = await api(`/tickets/${id}`, {
    method: 'PUT', token: admin, body: { title: 'Uji Penomoran Regional (edit judul)' },
  });
  check(titleOnly.status === 200 && titleOnly.data.data.ticket_number === noWest,
    'Ubah field lain tidak mengubah nomor', titleOnly.data?.data?.ticket_number);

  // --- 8. bersihkan ---
  const del = await api(`/tickets/${id}`, { method: 'DELETE', token: admin });
  check(del.status === 200, 'DELETE tiket uji', `HTTP ${del.status}`);
  const gone = await api(`/tickets/${id}`, { token: admin });
  check(gone.status === 404, 'Tiket uji hilang dari DB', `HTTP ${gone.status}`);

  console.log(`\n────────────────────────────────────────`);
  console.log(`Total pemeriksaan : ${pass + fail}`);
  console.log(`Berhasil          : ${pass}`);
  console.log(`Gagal             : ${fail}`);
  console.log(`────────────────────────────────────────\n`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
