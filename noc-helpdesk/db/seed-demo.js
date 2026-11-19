/**
 * SYNOC — demo ticket seeder.
 *
 * Creates a realistic spread of tickets across service types, priorities,
 * channels and statuses, including a couple of SLA breaches.
 *
 *   node db/seed-demo.js [count]
 */
import { query, queryOne, execute, transaction } from '../src/db.js';
import { config } from '../src/config.js';
import { nextTicketNumber } from '../src/ticket-number.js';
import { syncTicketSla, markFirstResponse, markResolved } from '../src/sla.js';

const TOTAL = Number(process.argv[2]) || 24;

const TITLES = [
  ['ACCESS', 'LOS total link akses pelanggan'],
  ['ACCESS', 'Power level rendah (−28 dBm) pada ONT'],
  ['ACCESS', 'Internet terputus sebagian di jam sibuk'],
  ['ACCESS', 'ONT tidak terdeteksi di OLT'],
  ['BACKBONE', 'Optical power drop jalur backbone BDG–JKT'],
  ['BACKBONE', 'Link 10GEC down di core router'],
  ['BACKBONE', 'Latency tinggi antar POP'],
  ['BACKBONE', 'Fiber cut jalur backbone'],
  ['FISHBONE', 'Kabel drop core salahursed'],
  ['FISHBONE', 'Splitter 1:8 over-loss di fishbone'],
  ['FISHBONE', 'Redundansi fishbone tidak aktif'],
  ['OTHER', 'Permintaan penambahan bandwidth'],
  ['OTHER', 'Relokasi perangkat ke POP baru'],
  ['ACCESS', 'Gangguan DHCP release pelanggan'],
  ['BACKBONE', 'BGP session flap di border router'],
  ['ACCESS', 'VLAN mismatch konfigurasi CPE'],
  ['FISHBONE', 'Redaman excess di splice point'],
  ['OTHER', 'Upgrade perangkat ke model baru'],
];

const DESCRIPTIONS = [
  'Pelanggan melaporkan layanan mati total sejak pagi. Telepon sudah dikonfirmasi via call center.',
  'Monitoring showing red loss of signal pada port upstream. Perlu pengecekan segera di lokasi.',
  'Terdapat degradasi sporadik. Retrieve jam 10:00-11:00. Traffic pattern meningkat setelah jam kerja.',
  'Perangkat mati total, tidak ada respons ping dari address management.',
  'Optical power drop SIGNIFIKANT pada salah satu link. Dampak ke seluruh trafik core.',
  'Session BGP flap berulang. Monitoring memicu alert berulang sejak jam dini hari.',
  'Kabel drop core terputus saat أعمال Preventif yesterday. Repository sudah dikembalikan.',
];

// "Reported By" pada aplikasi selalu diambil dari akun yang login.
// Data demo memakai nama-nama akun yang tersedia.
const REPORTED_BY = [
  'Administrator NOC', 'NOC Operator', 'Field Engineer',
];

const CHANNEL_CODES = ['CUSTOM', 'EMAIL', 'TELEGRAM', 'WHATSAPP', 'PHONE', 'PORTAL'];
const SERVICE_CODES = ['ACCESS', 'BACKBONE', 'FISHBONE', 'OTHER'];
const PRIORITY_CODES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// Weighted status distribution
const STATUS_POOL = [
  'open', 'open', 'open', 'in_progress', 'in_progress', 'in_progress',
  'pending_customer', 'escalated', 'resolved', 'resolved', 'closed',
];

function pick(arr, i) {
  return arr[i % arr.length];
}

async function main() {
  console.log(`SYNOC — seeding ${TOTAL} demo tickets`);

  const svcRows = await query('SELECT id, code FROM m_service_type');
  const priRows = await query('SELECT id, code FROM m_priority');
  const chRows = await query('SELECT id, code FROM m_report_channel');
  const popRows = await query('SELECT id FROM m_pop');
  const msRows = await query('SELECT id FROM m_ms_splitter');
  const linkRows = await query('SELECT id, isp_id, cid, link_name FROM m_link');
  const custRows = await query('SELECT id FROM m_customer');
  const picRows = await query('SELECT id FROM m_pic WHERE is_active = 1 ORDER BY id');
  const users = await query("SELECT id FROM users WHERE role IN ('noc','engineer') ORDER BY id");

  const svc = Object.fromEntries(svcRows.map((r) => [r.code, r.id]));
  const pri = Object.fromEntries(priRows.map((r) => [r.code, r.id]));
  const ch = Object.fromEntries(chRows.map((r) => [r.code, r.id]));

  const admin = await queryOne("SELECT id FROM users WHERE username = 'admin'");

  let created = 0;
  for (let i = 0; i < TOTAL; i++) {
    const [svcCode, title] = pick(TITLES, i);
    const svcId = svc[svcCode] ?? svc.ACCESS;
    // Priority correlates with service criticality
    const priPool = svcCode === 'BACKBONE' ? ['HIGH', 'CRITICAL', 'MEDIUM']
      : svcCode === 'FISHBONE' ? ['MEDIUM', 'HIGH', 'LOW']
      : PRIORITY_CODES;
    const priCode = pick(priPool, i * 3);
    const priId = pri[priCode] ?? pri.MEDIUM;
    const chCode = pick(CHANNEL_CODES, i * 5 + 1);
    const chId = ch[chCode] ?? ch.CUSTOM;

    const link = linkRows[i % linkRows.length];
    const popId = popRows[i % popRows.length]?.id ?? null;
    const msId = msRows[i % msRows.length]?.id ?? null;
    const custId = custRows[i % custRows.length]?.id ?? null;
    const picId = picRows.length ? (picRows[i % picRows.length]?.id ?? null) : null;
    const assignee = users[i % users.length]?.id ?? admin.id;
    const reportedBy = pick(REPORTED_BY, i);
    const status = pick(STATUS_POOL, i * 7);
    const regionalCode = ['WEST', 'CENTRAL', 'EAST'][i % 3];

    // Nomor tiket mengikuti regional: NOC<REGIONAL>/<YYYY>/<MM>/<urut>
    const ticketNumber = await nextTicketNumber(regionalCode);
    const isp = link?.isp_id ?? null;
    const ispRow = isp ? await queryOne('SELECT name FROM m_isp WHERE id = ?', [isp]) : null;

    const ticketId = await transaction(async (conn) => {
      const [r] = await conn.query(
        `INSERT INTO tickets (
           ticket_number, service_type_id, title, description,
           cid, link_id, link_name, isp_id, isp_name, pop_id, ms_splitter_id,
           mac_address, serial_number, vlan_id, signal_input_cpe_dbm, latitude, longitude,
           priority_id, channel_id, customer_id, customer_name, pic_id, reported_by,
           status, assigned_to, regional, created_by, created_at
         ) VALUES (?,?,?,?, ?,?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?)`,
        [
          ticketNumber, svcId, title, pick(DESCRIPTIONS, i),
          link?.cid ?? null, link?.id ?? null, link?.link_name ?? null, isp, ispRow?.name ?? null,
          popId, msId,
          `${['48:1F:3B', 'C0:B5:E2', '74:AC:B9', '00:1B:21'][i % 4]}:AA:00:${String(i + 1).padStart(2, '0')}`,
          `SN-${String(2026110000 + i)}`,
          String(100 + (i * 7) % 400),
          -(19 + (i % 12)) + (i % 3 === 0 ? 0.5 : 0),
          -6.2088 + (i % 10) * 0.05,
          106.8456 + (i % 10) * 0.05,
          priId, chId, custId, null, picId, reportedBy,
          status, assignee, regionalCode, admin.id,
          new Date(Date.now() - (i % 12) * 86400000 - (i % 20) * 3600000),
        ]
      );
      const id = r.insertId;
      await conn.query(
        `INSERT INTO ticket_events (ticket_id, event_type, to_value, note, created_by, created_at)
         VALUES (?, 'created', ?, ?, ?, ?)`,
        [id, ticketNumber, `Tiket dibuat melalui kanal ${chCode}`, admin.id,
         new Date(Date.now() - (i % 12) * 86400000 - (i % 20) * 3600000)]
      );
      return id;
    });

    // SLA clock, computed from the ticket's real creation time
    await syncTicketSla(ticketId, { serviceTypeId: svcId, priorityId: priId, reset: true });

    // Shift the SLA due dates so the spread reflects the real age of the ticket
    const ageMinutes = (i % 12) * 1440 + (i % 20) * 60;
    await execute(
      `UPDATE ticket_sla
          SET response_due_at   = DATE_ADD(response_due_at,   INTERVAL -? MINUTE),
              resolution_due_at = DATE_ADD(resolution_due_at, INTERVAL -? MINUTE)
        WHERE ticket_id = ?`,
      [ageMinutes, ageMinutes, ticketId]
    );

    // Progress the ticket so the timeline and SLA flags look realistic
    if (status !== 'open') {
      await markFirstResponse(ticketId);
      await execute(
        `INSERT INTO ticket_events (ticket_id, event_type, from_value, to_value, note, created_by)
         VALUES (?, 'status_change', 'open', ?, ?, ?)`,
        [ticketId, status, 'Penanganan dilanjutkan oleh tim NOC', assignee]
      );
    }
    if (status === 'resolved' || status === 'closed') {
      await markResolved(ticketId);
      await execute(
        `UPDATE tickets SET closed_at = NOW() WHERE id = ?`, [ticketId]
      );

      // Make the resolution timestamp realistic: roughly half of the closed
      // tickets are resolved inside the SLA window, the rest miss it.
      const slaRow = await queryOne(
        'SELECT resolution_due_at, response_due_at FROM ticket_sla WHERE ticket_id = ?',
        [ticketId]
      );
      if (slaRow?.resolution_due_at) {
        const due = new Date(slaRow.resolution_due_at).getTime();
        const createdMs = Date.now() - ageMinutes * 60000;
        const metSla = i % 2 === 0;
        // met  -> 60% of the way to the deadline
        // missed -> the deadline plus a 25% overrun
        const ratio = metSla ? 0.6 : 1.25;
        const resolvedMs = createdMs + (due - createdMs) * ratio;
        await execute(
          `UPDATE ticket_sla
              SET resolved_at = FROM_UNIXTIME(? / 1000),
                  first_response_at = FROM_UNIXTIME(? / 1000),
                  resolution_breached = ?
            WHERE ticket_id = ?`,
          [resolvedMs, createdMs + (due - createdMs) * 0.15, metSla ? 0 : 1, ticketId]
        );
        await execute(
          `UPDATE tickets SET closed_at = FROM_UNIXTIME(? / 1000) WHERE id = ?`,
          [resolvedMs, ticketId]
        );
      }
    }

    created++;
  }

  // Force a couple of tickets into breach so the dashboard shows a real signal
  const openIds = await query(
    `SELECT ticket_id FROM ticket_sla
      WHERE resolution_due_at IS NOT NULL AND NOW() > resolution_due_at LIMIT 3`
  );
  for (const row of openIds) {
    await execute(
      `UPDATE ticket_sla SET response_breached = 1, resolution_breached = 1 WHERE ticket_id = ?`,
      [row.ticket_id]
    );
  }

  console.log(`✓ ${created} demo tickets created`);
  console.log(`  breached: ${openIds.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('✗ Seed failed:', err);
  process.exit(1);
});
