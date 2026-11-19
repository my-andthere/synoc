/**
 * SYNOC — SLA engine.
 *
 * Resolves the SLA policy for a (service type, priority) pair, computes
 * response/resolution due dates, and evaluates breach + met state.
 */
import { queryOne, query, execute, transaction } from './db.js';

const HOUR_MS = 3600 * 1000;

/**
 * Look up the SLA policy for a service type + priority.
 * Falls back to the priority's own built-in hours when no policy row exists.
 */
export async function resolvePolicy(serviceTypeId, priorityId) {
  const policy = await queryOne(
    `SELECT p.*, pr.code AS priority_code, pr.name AS priority_name, pr.color AS priority_color,
            st.code AS service_type_code, st.name AS service_type_name
       FROM m_sla_policy p
       JOIN m_priority pr    ON pr.id = p.priority_id
       JOIN m_service_type st ON st.id = p.service_type_id
      WHERE p.service_type_id = ? AND p.priority_id = ? AND p.is_active = 1`,
    [serviceTypeId, priorityId]
  );
  if (policy) return policy;

  const fallback = await queryOne(
    `SELECT pr.id AS priority_id, pr.code AS priority_code, pr.name AS priority_name,
            pr.color AS priority_color, pr.response_hours, pr.resolution_hours,
            st.code AS service_type_code, st.name AS service_type_name
       FROM m_priority pr
       CROSS JOIN m_service_type st
      WHERE pr.id = ? AND st.id = ?`,
    [priorityId, serviceTypeId]
  );
  if (!fallback) return null;
  return { ...fallback, id: null, sla_policy_id: null, escalation_hours: null,
           pause_on_customer_wait: 1, business_hours_only: 0 };
}

/**
 * Compute SLA due dates for a ticket.
 * @returns {{responseDueAt: Date, resolutionDueAt: Date, policy: object|null}}
 */
export async function computeDueDates(serviceTypeId, priorityId, from = new Date()) {
  const policy = await resolvePolicy(serviceTypeId, priorityId);
  if (!policy) return { responseDueAt: null, resolutionDueAt: null, policy: null };

  const base = new Date(from);
  const responseDueAt = new Date(base.getTime() + Number(policy.response_hours) * HOUR_MS);
  const resolutionDueAt = new Date(base.getTime() + Number(policy.resolution_hours) * HOUR_MS);
  return { responseDueAt, resolutionDueAt, policy };
}

/**
 * Attach / refresh the SLA clock row for a ticket.
 * Called on ticket creation and whenever priority or service type changes.
 *
 * @param {number} ticketId
 * @param {object} opts
 * @param {number} opts.serviceTypeId
 * @param {number} opts.priorityId
 * @param {boolean} [opts.reset]  hitung ulang due date dari `from`
 * @param {Date}   [opts.from]    titik awal SLA (default: waktu sekarang)
 */
export async function syncTicketSla(ticketId, { serviceTypeId, priorityId, reset = false, from }) {
  const existing = await queryOne('SELECT * FROM ticket_sla WHERE ticket_id = ?', [ticketId]);
  const { responseDueAt, resolutionDueAt, policy } = await computeDueDates(
    serviceTypeId,
    priorityId,
    from || new Date()
  );

  if (!existing) {
    await execute(
      `INSERT INTO ticket_sla (ticket_id, sla_policy_id, priority_id, response_due_at, resolution_due_at)
       VALUES (?, ?, ?, ?, ?)`,
      [ticketId, policy?.id ?? null, priorityId, responseDueAt, resolutionDueAt]
    );
    return { responseDueAt, resolutionDueAt, policy };
  }

  if (reset) {
    await execute(
      `UPDATE ticket_sla
          SET sla_policy_id = ?, priority_id = ?, response_due_at = ?, resolution_due_at = ?,
              response_breached = 0, resolution_breached = 0
        WHERE ticket_id = ?`,
      [policy?.id ?? null, priorityId, responseDueAt, resolutionDueAt, ticketId]
    );
  } else {
    await execute(
      `UPDATE ticket_sla SET sla_policy_id = ?, priority_id = ? WHERE ticket_id = ?`,
      [policy?.id ?? null, priorityId, ticketId]
    );
  }
  return { responseDueAt, resolutionDueAt, policy };
}

/**
 * Mark first response if not yet set — used when an engineer first acts.
 */
export async function markFirstResponse(ticketId) {
  await execute(
    `UPDATE ticket_sla
        SET first_response_at = COALESCE(first_response_at, NOW()),
            response_breached = CASE
              WHEN response_due_at IS NOT NULL AND NOW() > response_due_at THEN 1
              ELSE response_breached END
      WHERE ticket_id = ?`,
    [ticketId]
  );
}

/**
 * Freeze the SLA clock when a ticket is resolved/closed.
 */
export async function markResolved(ticketId) {
  await execute(
    `UPDATE ticket_sla
        SET resolved_at = NOW(),
            resolution_breached = CASE
              WHEN resolution_due_at IS NOT NULL AND NOW() > resolution_due_at THEN 1
              ELSE resolution_breached END
      WHERE ticket_id = ?`,
    [ticketId]
  );
}

/**
 * Pause the clock (e.g. ticket moved to "pending customer").
 * The elapsed pause is added back to the due dates when resumed.
 */
export async function pauseClock(ticketId) {
  const row = await queryOne('SELECT paused_at, paused_minutes FROM ticket_sla WHERE ticket_id = ?', [ticketId]);
  if (!row || row.paused_at) return;
  await execute('UPDATE ticket_sla SET paused_at = NOW() WHERE ticket_id = ?', [ticketId]);
}

/**
 * Resume the clock, extending due dates by the paused duration.
 */
export async function resumeClock(ticketId) {
  const row = await queryOne('SELECT paused_at, paused_minutes FROM ticket_sla WHERE ticket_id = ?', [ticketId]);
  if (!row || !row.paused_at) return;
  const pausedMs = Date.now() - new Date(row.paused_at).getTime();
  const pausedMinutes = Math.round(pausedMs / 60000);
  await execute(
    `UPDATE ticket_sla
        SET paused_at = NULL,
            paused_minutes = paused_minutes + ?,
            response_due_at   = IFNULL(DATE_ADD(response_due_at, INTERVAL ? MINUTE), response_due_at),
            resolution_due_at = IFNULL(DATE_ADD(resolution_due_at, INTERVAL ? MINUTE), resolution_due_at)
      WHERE ticket_id = ?`,
    [pausedMinutes, pausedMinutes, pausedMinutes, ticketId]
  );
}

/**
 * Recompute breach flags for all open tickets (run on server start / cron).
 */
export async function refreshBreachFlags() {
  const result = await execute(
    `UPDATE ticket_sla s
       JOIN tickets t ON t.id = s.ticket_id
        SET s.response_breached   = CASE WHEN s.response_due_at IS NOT NULL
                                                AND NOW() > s.response_due_at
                                                AND (s.first_response_at IS NULL OR s.first_response_at > s.response_due_at)
                                           THEN 1 ELSE s.response_breached END,
            s.resolution_breached = CASE WHEN s.resolution_due_at IS NOT NULL
                                                AND NOW() > s.resolution_due_at
                                                AND (s.resolved_at IS NULL OR s.resolved_at > s.resolution_due_at)
                                           THEN 1 ELSE s.resolution_breached END`
  );
  return result.affectedRows ?? 0;
}

/**
 * SLA summary used by the dashboard.
 */
export async function slaSummary() {
  const totals = await queryOne(
    `SELECT
       COUNT(*)                                                   AS total,
       SUM(CASE WHEN t.status NOT IN ('resolved','closed','cancelled') THEN 1 ELSE 0 END) AS open_total,
       SUM(CASE WHEN t.status NOT IN ('resolved','closed','cancelled')
                 AND s.resolution_due_at IS NOT NULL
                 AND NOW() > s.resolution_due_at THEN 1 ELSE 0 END)  AS breached,
       SUM(CASE WHEN t.status NOT IN ('resolved','closed','cancelled')
                 AND s.resolution_due_at IS NOT NULL
                 AND NOW() <= s.resolution_due_at THEN 1 ELSE 0 END)  AS within_sla,
       SUM(CASE WHEN t.status IN ('resolved','closed') THEN 1 ELSE 0 END) AS closed_total,
       SUM(CASE WHEN t.status IN ('resolved','closed') AND s.resolved_at IS NOT NULL
                 AND s.resolved_at <= s.resolution_due_at THEN 1 ELSE 0 END) AS met,
       SUM(CASE WHEN t.status IN ('resolved','closed') AND s.resolved_at IS NOT NULL
                 AND s.resolved_at > s.resolution_due_at THEN 1 ELSE 0 END) AS missed,
       AVG(CASE WHEN s.resolved_at IS NOT NULL
                THEN TIMESTAMPDIFF(MINUTE, t.created_at, s.resolved_at) END)   AS avg_resolution_minutes
     FROM tickets t
     LEFT JOIN ticket_sla s ON s.ticket_id = t.id`
  );

  const byPriority = await query(
    `SELECT p.name AS priority_name, p.code AS priority_code, p.color,
            COUNT(t.id) AS total,
            SUM(CASE WHEN t.status NOT IN ('resolved','closed','cancelled')
                      AND s.resolution_due_at IS NOT NULL
                      AND NOW() > s.resolution_due_at THEN 1 ELSE 0 END) AS breached
       FROM m_priority p
       LEFT JOIN tickets t    ON t.priority_id = p.id
       LEFT JOIN ticket_sla s ON s.ticket_id = t.id
      GROUP BY p.id, p.name, p.code, p.color, p.sort_order
      ORDER BY p.sort_order`
  );

  const byServiceType = await query(
    `SELECT st.name AS service_type_name, st.code AS service_type_code,
            COUNT(t.id) AS total,
            SUM(CASE WHEN t.status NOT IN ('resolved','closed','cancelled')
                      AND s.resolution_due_at IS NOT NULL
                      AND NOW() > s.resolution_due_at THEN 1 ELSE 0 END) AS breached
       FROM m_service_type st
       LEFT JOIN tickets t    ON t.service_type_id = st.id
       LEFT JOIN ticket_sla s ON s.ticket_id = t.id
      GROUP BY st.id, st.name, st.code, st.sort_order
      ORDER BY st.sort_order`
  );

  // SLA compliance is measured over *closed* tickets only — an open ticket
  // has not breached SLA until its due date passes.
  const closedTotal = Number(totals.closed_total) || 0;
  const met = Number(totals.met) || 0;
  const compliance = closedTotal > 0 ? Math.round((met / closedTotal) * 100) : 100;

  return { ...totals, compliance_percent: compliance, by_priority: byPriority, by_service_type: byServiceType };
}
