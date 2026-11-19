/**
 * Test: lampiran gambar pada catatan timeline.
 *
 * Jalankan:
 *   node db/test-ticket-attachments.js http://127.0.0.1:8000
 *
 * Skenario:
 *   1. Catatan + 1 gambar PNG -> tersimpan, metadata benar, berkas ada di disk
 *   2. Catatan + beberapa gambar -> semua tersimpan
 *   3. Catatan tanpa gambar tetap berfungsi (regresi)
 *   4. Tipe berkas bukan gambar -> 400
 *   5. Lampiran bisa diunduh kembali (endpoint ber-token)
 *   6. Endpoint lampiran tanpa token -> 401
 *   7. Berkas & baris terhapus saat tiket dihapus
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, queryOne } from '../src/db.js';
import { UPLOAD_DIR } from '../src/attachments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] || 'http://127.0.0.1:8000').replace(/\/$/, '');

let pass = 0;
let fail = 0;

function check(ok, label, extra = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  ✗ ${label}${extra ? ' — ' + extra : ''}`); }
}

/** PNG 1x1 transparan (bas64). */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
/** PNG 2x2 merah (base64). */
const PNG_2PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
  'base64'
);

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
  return { status: res.status, data, headers: res.headers };
}

/** POST multipart/form-data dengan lampiran gambar. */
async function postEventWithFiles(ticketId, token, { note, files = [], occurredTime = null }) {
  const fd = new FormData();
  fd.append('note', note);
  fd.append('event_type', 'note');
  if (occurredTime) fd.append('occurred_time', occurredTime);
  for (const f of files) {
    fd.append('files', new Blob([f.buffer], { type: f.type }), f.name);
  }
  const res = await fetch(`${BASE}/api/tickets/${ticketId}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { status: res.status, data };
}

(async () => {
  console.log(`\n=== Test Lampiran Gambar pada Catatan ===`);
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

  // --- tiket uji ---
  const created = await api('/tickets', {
    method: 'POST',
    token,
    body: {
      title: 'Uji Lampiran Gambar',
      description: 'tiket sementara untuk pengujian lampiran gambar',
      service_type_id: svc.data.data[0].id,
      priority_id: pri.data.data[0].id,
      regional: 'CENTRAL',
    },
  });
  check(created.status === 201, 'tiket uji dibuat', `HTTP ${created.status}`);
  if (created.status !== 201) {
    console.log(`     ${JSON.stringify(created.data)}`);
    process.exit(1);
  }
  const ticketId = created.data.data.id;

  // --- 1. catatan + 1 gambar ---
  const r1 = await postEventWithFiles(ticketId, token, {
    note: 'Catatan dengan satu gambar',
    files: [{ buffer: PNG_1PX, type: 'image/png', name: 'screenshot.png' }],
  });
  check(r1.status === 201, 'catatan + 1 gambar diterima', `HTTP ${r1.status}`);
  const att1 = r1.data?.attachments?.[0];
  check(
    Array.isArray(r1.data?.attachments) && r1.data.attachments.length === 1,
    '1 lampiran dikembalikan',
    `${r1.data?.attachments?.length ?? 0} lampiran`
  );
  check(att1?.file_name === 'screenshot.png', 'nama berkas asli disimpan', att1?.file_name);
  check(att1?.mime_type === 'image/png', 'mime type tersimpan', att1?.mime_type);
  check(
    Number(att1?.size_bytes) === PNG_1PX.length,
    'ukuran berkas tersimpan',
    `${att1?.size_bytes} byte`
  );

  const dbRow = await queryOne(
    'SELECT * FROM ticket_event_attachments WHERE id = ?', [att1?.id ?? 0]
  );
  check(!!dbRow, 'baris lampiran ada di database');
  check(dbRow?.ticket_id === ticketId, 'lampiran tertaut ke tiket yang benar');

  // Berkas fisik benar-benar ada di disk.
  const filePath = path.join(UPLOAD_DIR, dbRow?.stored_name || 'x');
  let exists = false;
  try { await fs.access(filePath); exists = true; } catch { exists = false; }
  check(exists, 'berkas tersimpan di disk', path.basename(filePath));

  // Nama berkas tersimpan harus acak (bukan nama asli) -> anti path traversal.
  check(dbRow?.stored_name !== 'screenshot.png', 'nama berkas di disk diacak');

  // --- 2. beberapa gambar sekaligus ---
  const r2 = await postEventWithFiles(ticketId, token, {
    note: 'Catatan dengan tiga gambar',
    files: [
      { buffer: PNG_1PX, type: 'image/png', name: 'a.png' },
      { buffer: PNG_2PX, type: 'image/png', name: 'b.png' },
      { buffer: PNG_2PX, type: 'image/png', name: 'c.png' },
    ],
  });
  check(r2.status === 201, 'catatan + 3 gambar diterima', `HTTP ${r2.status}`);
  check(
    r2.data?.attachments?.length === 3,
    '3 lampiran dikembalikan',
    `${r2.data?.attachments?.length ?? 0} lampiran`
  );

  // Lampiran menempel ke event yang benar.
  // Pakai event_id dari balasan API (tidak ambigu) + dicek ulang ke DB.
  const linked = await query(
    'SELECT id FROM ticket_event_attachments WHERE event_id = ? AND ticket_id = ?',
    [r2.data?.event_id ?? 0, ticketId]
  );
  check(
    linked.length === 3,
    'ketiga lampiran menempel pada event yang benar',
    `${linked.length} baris (event #${r2.data?.event_id})`
  );

  // --- 3. catatan tanpa gambar (regresi) ---
  const r3 = await api(`/tickets/${ticketId}/events`, {
    method: 'POST', token, body: { note: 'Catatan tanpa gambar', event_type: 'note' },
  });
  check(r3.status === 201, 'catatan tanpa gambar tetap berfungsi', `HTTP ${r3.status}`);
  check(
    (r3.data?.attachments?.length ?? 0) === 0,
    'tanpa lampiran, daftar lampiran kosong'
  );

  // --- 4. tipe berkas bukan gambar -> 400 ---
  const fdBad = new FormData();
  fdBad.append('note', 'Catatan dengan berkas teks');
  fdBad.append('event_type', 'note');
  fdBad.append('files', new Blob([Buffer.from('halo dunia')], { type: 'text/plain' }), 'catatan.txt');
  const r4 = await fetch(`${BASE}/api/tickets/${ticketId}/events`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fdBad,
  });
  check(r4.status === 400, 'tipe berkas bukan gambar ditolak', `HTTP ${r4.status}`);
  const badRows = await query(
    `SELECT COUNT(*) AS c FROM ticket_event_attachments WHERE file_name = 'catatan.txt'`
  );
  check(Number(badRows[0].c) === 0, 'berkas ditolak tidak tersimpan');

  // --- 5. lampiran bisa diunduh kembali ---
  const dl = await fetch(`${BASE}/api/tickets/attachments/${att1.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dlBuf = Buffer.from(await dl.arrayBuffer());
  check(dl.status === 200, 'lampiran dapat diunduh', `HTTP ${dl.status}`);
  check(
    dl.headers.get('content-type')?.includes('image/png'),
    'content-type lampiran benar',
    dl.headers.get('content-type')
  );
  check(dlBuf.length === PNG_1PX.length, 'isi berkas utuh saat diunduh', `${dlBuf.length} byte`);

  // --- 6. tanpa token -> 401 ---
  const anon = await fetch(`${BASE}/api/tickets/attachments/${att1.id}`);
  check(anon.status === 401, 'lampiran tanpa token ditolak', `HTTP ${anon.status}`);

  // --- 7. hapus tiket -> berkas ikut terhapus ---
  const before = await query(
    'SELECT stored_name FROM ticket_event_attachments WHERE ticket_id = ?', [ticketId]
  );
  const paths = before.map((b) => path.join(UPLOAD_DIR, b.stored_name));

  const del = await api(`/tickets/${ticketId}`, { method: 'DELETE', token });
  check(del.status === 200, 'tiket uji dihapus', `HTTP ${del.status}`);

  const left = await query(
    'SELECT COUNT(*) AS c FROM ticket_event_attachments WHERE ticket_id = ?', [ticketId]
  );
  check(Number(left[0].c) === 0, 'baris lampiran terhapus (cascade)');

  let filesLeft = 0;
  for (const p of paths) {
    try { await fs.access(p); filesLeft++; } catch { /* sudah hilang */ }
  }
  check(filesLeft === 0, 'berkas fisik lampiran terhapus dari disk', `${filesLeft} berkas tersisa`);

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===\n`);
  process.exit(fail ? 1 : 0);
})();
