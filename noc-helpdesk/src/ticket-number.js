/**
 * SYNOC — ticket numbering.
 *
 * Format: NOC<REGIONAL>/<YYYY>/<MM>/<seq>
 *
 *   NOCCENTRAL/2026/11/00001
 *   NOCWEST/2026/11/00001
 *   NOCEAST/2026/11/00001
 *
 * The sequence is scoped per regional per month, so every regional keeps its
 * own counter (NOCWEST/2026/11/00001 and NOCWEST/2026/12/00001 are
 * independent). Tickets created without a regional fall back to the generic
 * `NOC/<YYYY>/<MM>/<seq>` prefix.
 */
import { query, queryOne, execute } from './db.js';

const PREFIX = 'NOC';

/** Regional codes that may appear in a ticket number. */
export const REGIONALS = ['WEST', 'CENTRAL', 'EAST'];

/**
 * Normalize a regional code.
 * @returns {string} the uppercase code, or '' when not supplied
 */
export function normalizeRegional(value) {
  if (value === undefined || value === null || value === '') return '';
  const v = String(value).trim().toUpperCase();
  return REGIONALS.includes(v) ? v : '';
}

/**
 * Build the fixed part of a ticket number for a regional + month.
 * @param {string} regionalCode  WEST | CENTRAL | EAST (may be empty)
 * @param {Date}   at             reference date (defaults to now)
 */
export function ticketNumberPrefix(regionalCode, at = new Date()) {
  return ticketNumberPrefixFor(regionalCode, at.getFullYear(), at.getMonth() + 1);
}

/**
 * Build the fixed part of a ticket number from an explicit year + month.
 *
 * Used when a ticket keeps its original creation period but changes its
 * regional — the period is then taken from the database instead of the
 * client's clock, so the timezone can never shift the year/month.
 *
 * @param {string} regionalCode      WEST | CENTRAL | EAST (may be empty)
 * @param {number|string} year       e.g. 2026
 * @param {number|string} month      1..12
 */
export function ticketNumberPrefixFor(regionalCode, year, month) {
  const region = normalizeRegional(regionalCode);
  const yyyy = String(year ?? '').padStart(4, '0');
  const mm = String(month ?? '').padStart(2, '0');
  return region ? `${PREFIX}${region}/${yyyy}/${mm}/` : `${PREFIX}/${yyyy}/${mm}/`;
}

/** The pattern matching every ticket number of a regional + month. */
export function ticketNumberPattern(regionalCode, at = new Date()) {
  return `${ticketNumberPrefix(regionalCode, at)}%`;
}

/**
 * Generate the next ticket number for a regional.
 * The sequence is scoped per regional per month.
 *
 * @param {string} regionalCode  WEST | CENTRAL | EAST (may be empty)
 * @returns {Promise<string>} e.g. "NOCWEST/2026/11/00001"
 */
export async function nextTicketNumber(regionalCode, at = new Date()) {
  return nextTicketNumberFor(regionalCode, at.getFullYear(), at.getMonth() + 1);
}

/**
 * Generate the next ticket number for a regional + an explicit period.
 * The sequence is scoped per regional per month.
 *
 * @param {string} regionalCode      WEST | CENTRAL | EAST (may be empty)
 * @param {number|string} year
 * @param {number|string} month       1..12
 * @param {number|string|null} excludeTicketId  ticket yang tidak ikut dihitung
 * @returns {Promise<string>} e.g. "NOCWEST/2026/11/00013"
 */
export async function nextTicketNumberFor(regionalCode, year, month, excludeTicketId = null) {
  const head = ticketNumberPrefixFor(regionalCode, year, month);
  const like = `${head}%`;

  const params = [like];
  let sql = `SELECT ticket_number FROM tickets WHERE ticket_number LIKE ?`;
  if (excludeTicketId !== null && excludeTicketId !== undefined) {
    sql += ' AND id <> ?';
    params.push(excludeTicketId);
  }
  sql += ' ORDER BY ticket_number DESC LIMIT 1';

  const row = await queryOne(sql, params);

  let seq = 1;
  if (row?.ticket_number) {
    const tail = row.ticket_number.split('/').pop();
    const parsed = parseInt(tail, 10);
    if (Number.isFinite(parsed)) seq = parsed + 1;
  }
  return `${head}${String(seq).padStart(5, '0')}`;
}

/**
 * Recompute the ticket number of an existing ticket after its regional
 * changed.
 *
 * The ticket keeps its original creation period (year/month taken from the
 * database) and receives the next free sequence of the NEW regional, e.g.
 * `NOCCENTRAL/2026/11/00009` → `NOCWEST/2026/11/00013`.
 *
 * @param {object} ticket        row tiket (id, created_at, created_year, created_month)
 * @param {string} newRegional   WEST | CENTRAL | EAST
 * @returns {Promise<string>} nomor tiket baru
 */
export async function renumberTicketForRegional(ticket, newRegional) {
  const fallback = new Date(ticket.created_at || Date.now());
  const year = ticket.created_year ?? fallback.getFullYear();
  const month = ticket.created_month ?? fallback.getMonth() + 1;
  return nextTicketNumberFor(newRegional, year, month, ticket.id);
}

/**
 * True when a ticket number already follows the current format.
 * Used by the migration below to detect legacy rows.
 */
export function hasCurrentFormat(ticketNumber) {
  return /^NOC(WEST|CENTRAL|EAST)?\/\d{4}\/\d{2}\/\d{5}$/.test(String(ticketNumber || ''));
}

/**
 * Renumber legacy tickets into the current format.
 *
 * Legacy rows (e.g. `SYNOC-ACC-202611-0007`) are grouped by
 * regional + year + month of their creation date and renumbered sequentially
 * inside each group. The timeline event that recorded the original number is
 * updated as well, so the audit trail stays consistent.
 *
 * Idempotent: rows that already match the current format are left alone.
 *
 * @returns {Promise<{renumbered: number, samples: string[]}>}
 */
export async function renumberLegacyTickets() {
  const rows = await query(
    `SELECT id, ticket_number, regional, created_at
       FROM tickets
      ORDER BY created_at ASC, id ASC`
  );

  const legacy = rows.filter((r) => !hasCurrentFormat(r.ticket_number));
  if (!legacy.length) return { renumbered: 0, samples: [] };

  // Sequence counter per regional + year-month group.
  const counters = new Map();
  const updates = [];

  for (const row of legacy) {
    const created = new Date(row.created_at);
    const region = normalizeRegional(row.regional);
    const group = `${region}|${created.getFullYear()}|${created.getMonth() + 1}`;

    const next = (counters.get(group) || 0) + 1;
    counters.set(group, next);

    const prefix = ticketNumberPrefix(region, created);
    const newNumber = `${prefix}${String(next).padStart(5, '0')}`;

    updates.push({ id: row.id, oldNumber: row.ticket_number, newNumber });
  }

  for (const u of updates) {
    await execute('UPDATE tickets SET ticket_number = ? WHERE id = ?', [u.newNumber, u.id]);
    // Keep the "tiket dibuat" timeline event in sync.
    await execute(
      `UPDATE ticket_events
          SET to_value = ?
        WHERE event_type = 'created' AND to_value = ?`,
      [u.newNumber, u.oldNumber]
    );
  }

  return {
    renumbered: updates.length,
    samples: updates.slice(0, 5).map((u) => `${u.oldNumber} → ${u.newNumber}`),
  };
}
