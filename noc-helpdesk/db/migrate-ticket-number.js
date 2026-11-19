/**
 * SYNOC — migrate legacy ticket numbers to the regional format.
 *
 * Old format: SYNOC-<SERVICE>-<YYYYMM>-<seq>   (e.g. SYNOC-ACC-202611-0007)
 * New format: NOC<REGIONAL>/<YYYY>/<MM>/<seq> (e.g. NOCWEST/2026/11/00001)
 *
 * Tickets are grouped by regional + year + month of their creation date and
 * renumbered sequentially inside each group. The timeline event that recorded
 * the original number is updated as well.
 *
 *   npm run db:renumber
 *
 * Idempotent — running it twice does not change anything the second time.
 */
import { query } from '../src/db.js';
import { renumberLegacyTickets, hasCurrentFormat } from '../src/ticket-number.js';

async function main() {
  console.log('SYNOC — migrasi nomor tiket ke format regional');

  const before = await query(
    `SELECT id, ticket_number, regional FROM tickets ORDER BY id`
  );
  const legacy = before.filter((r) => !hasCurrentFormat(r.ticket_number));

  console.log(`  total tiket          : ${before.length}`);
  console.log(`  perlu dimigrasikan   : ${legacy.length}`);
  if (!legacy.length) {
    console.log('  → semua nomor tiket sudah berformat regional');
    return;
  }

  const result = await renumberLegacyTickets();
  console.log(`  → ${result.renumbered} tiket dinomori ulang`);
  result.samples.forEach((s) => console.log(`     ${s}`));

  // Verifikasi: tidak ada nomor lama yang tersisa & nomor tetap unik.
  const after = await query(
    `SELECT id, ticket_number, regional FROM tickets ORDER BY id`
  );
  const stillLegacy = after.filter((r) => !hasCurrentFormat(r.ticket_number));
  const numbers = after.map((r) => r.ticket_number);
  const unique = new Set(numbers).size === numbers.length;

  console.log(`  → sisa format lama   : ${stillLegacy.length}`);
  console.log(`  → nomor unik         : ${unique ? 'ya' : 'TIDAK'}`);

  console.log('\nDistribusi per regional:');
  const dist = await query(
    `SELECT COALESCE(regional, '(kosong)') AS regional,
            COUNT(*) AS jumlah,
            MIN(ticket_number) AS contoh_pertama,
            MAX(ticket_number) AS contoh_terakhir
       FROM tickets
      GROUP BY regional
      ORDER BY regional`
  );
  for (const d of dist) {
    console.log(`  ${String(d.regional).padEnd(10)} ${d.jumlah} tiket  ${d.contoh_pertama} … ${d.contoh_terakhir}`);
  }

  if (stillLegacy.length || !unique) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('\n✗ Migrasi gagal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    process.exit(process.exitCode);
  });
