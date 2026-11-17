/**
 * SYNOC — ticket numbering.
 *
 * Format: SYNOC-<SERVICE>-<YYYYMM>-<seq>
 * e.g.  SYNOC-ACC-202611-0007
 */
import { queryOne } from './db.js';

const TYPE_PREFIX = {
  ACCESS: 'ACC',
  BACKBONE: 'BBC',
  FISHBONE: 'FSB',
  OTHER: 'OTH',
};

/**
 * Generate the next ticket number for a service type.
 * The sequence is scoped per service type per month.
 */
export async function nextTicketNumber(serviceTypeCode) {
  const prefix = TYPE_PREFIX[serviceTypeCode] || 'GEN';
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const like = `SYNOC-${prefix}-${ym}-%`;

  const row = await queryOne(
    `SELECT ticket_number FROM tickets
      WHERE ticket_number LIKE ?
      ORDER BY ticket_number DESC LIMIT 1`,
    [like]
  );

  let seq = 1;
  if (row?.ticket_number) {
    const tail = row.ticket_number.split('-').pop();
    const parsed = parseInt(tail, 10);
    if (Number.isFinite(parsed)) seq = parsed + 1;
  }
  return `SYNOC-${prefix}-${ym}-${String(seq).padStart(4, '0')}`;
}
