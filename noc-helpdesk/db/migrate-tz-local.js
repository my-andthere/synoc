/**
 * SYNOC — migrasi zona waktu ke konvensi "waktu lokal".
 *
 * LATAR BELAKANG
 * --------------
 * Hampir semua kolom DATETIME di database diisi oleh MySQL sendiri
 * (`CURRENT_TIMESTAMP` / `NOW()`) sehingga isinya adalah *wall clock lokal*
 * server database. Seal inversa, `ticket_sla.response_due_at` dan
 * `resolution_due_at` diisi dari objek `Date` JavaScript — dengan
 * `timezone: 'Z'` mysql2 menulisnya sebagai *wall clock UTC* (7 jam lebih
 * awal dari waktu lokal).
 *
 * Akibatnya:
 *   - kolom SLA dibandingkan dengan `NOW()` memakai konvensi yang berbeda
 *     -> pelanggaran SLA terdeteksi terlalu cepat (7 jam);
 *   - seluruh jam yang tampil di browser bergeser 7 jam.
 *
 * Yang dilakukan migrasi ini:
 *   1. `src/db.js` memakai `timezone: 'local'` (perubahan kode, dilakukan
 *      terpisah dari skrip ini).
 *   2. Skrip ini menggeser `ticket_sla.response_due_at` dan
 *      `resolution_due_at` sebesar offset lokal (UTC+7 = +420 menit) supaya
 *      ikut memakai konvensi waktu lokal.
 *
 * Idempoten: penanda `tz_local_ticket_sla` pada tabel `m_schema_migration`
 * membuat migrasi hanya jalan sekali.
 *
 *   node db/migrate-tz-local.js
 */
import { query, queryOne, execute } from '../src/db.js';

const MARKER = 'tz_local_ticket_sla';

async function main() {
  console.log('SYNOC — migrasi zona waktu ke konvensi waktu lokal\n');

  // Tabel penanda harus ada (dibuat oleh schema.sql).
  const markerTable = await queryOne(
    `SELECT COUNT(*) AS c FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'm_schema_migration'`
  );
  if (!Number(markerTable.c)) {
    console.log('  → tabel m_schema_migration belum ada — jalankan `node db/init.js` dulu');
    process.exitCode = 1;
    return;
  }

  const done = await queryOne('SELECT * FROM m_schema_migration WHERE name = ?', [MARKER]);
  if (done) {
    console.log(`  → migrasi sudah pernah dijalankan (${MARKER}) — tidak ada yang berubah`);
    return;
  }

  // Offset lokal server database dibanding UTC (WIB => +420 menit).
  const offsetRow = await queryOne(
    'SELECT TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS offset_minutes'
  );
  const offset = Number(offsetRow?.offset_minutes ?? 0);
  console.log(`  → offset server database terhadap UTC: ${offset} menit`);

  if (!offset) {
    console.log('  → server database sudah memakai UTC — tidak ada yang perlu digeser');
    await execute(
      'INSERT INTO m_schema_migration (name, note) VALUES (?, ?)',
      [MARKER, 'Server DB sudah UTC, tidak ada pergeseran']
    );
    return;
  }

  // Hanya baris yang punya due date yang digeser.
  const before = await queryOne(
    `SELECT COUNT(*) AS c FROM ticket_sla
      WHERE response_due_at IS NOT NULL OR resolution_due_at IS NOT NULL`
  );
  console.log(`  → menggeser ${before.c} baris ticket_sla sebesar ${offset} menit`);

  await execute(
    `UPDATE ticket_sla
        SET response_due_at   = DATE_ADD(response_due_at,   INTERVAL ? MINUTE),
            resolution_due_at = DATE_ADD(resolution_due_at, INTERVAL ? MINUTE)
      WHERE response_due_at IS NOT NULL OR resolution_due_at IS NOT NULL`,
    [offset, offset]
  );

  await execute(
    'INSERT INTO m_schema_migration (name, note) VALUES (?, ?)',
    [MARKER, `due date digeser ${offset} menit ke waktu lokal`]
  );

  const sample = await query(
    `SELECT s.ticket_id, s.response_due_at, s.resolution_due_at, t.created_at
       FROM ticket_sla s JOIN tickets t ON t.id = s.ticket_id
      ORDER BY s.ticket_id LIMIT 3`
  );
  console.log('  → contoh:');
  for (const s of sample) {
    console.log(`     tiket #${s.ticket_id} dibuat ${s.created_at} → due ${s.resolution_due_at}`);
  }

  console.log('\n✓ Migrasi selesai. Restart gateway agar `timezone: \'local\'` aktif.\n');
}

main().catch((err) => {
  console.error('✗ Migrasi gagal:', err.message);
  process.exitCode = 1;
});
