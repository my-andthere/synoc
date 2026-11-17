/**
 * SYNOC — ticket routes.
 *
 * Covers the full NOC helpdesk workflow: create, list, filter, update,
 * assign, transition status, add timeline events, and SLA monitoring.
 */
import { Router } from 'express';
import { query, queryOne, execute, transaction } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { nextTicketNumber } from '../ticket-number.js';
import {
  syncTicketSla, markFirstResponse, markResolved, pauseClock, resumeClock,
  slaSummary, resolvePolicy,
} from '../sla.js';

export const ticketRouter = Router();

ticketRouter.use(requireAuth);

const OPEN_STATUSES = ['open', 'in_progress', 'pending_customer', 'escalated'];
const CLOSED_STATUSES = ['resolved', 'closed', 'cancelled'];

const STATUSES = [...OPEN_STATUSES, ...CLOSED_STATUSES];

/** Log a timeline event for a ticket. */
async function logEvent(conn, ticketId, type, { from, to, note, userId }) {
  const runner = conn || { execute };
  await runner.execute(
    `INSERT INTO ticket_events (ticket_id, event_type, from_value, to_value, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [ticketId, type, from ?? null, to ?? null, note ?? null, userId ?? null]
  );
}

/** Parse a possibly-empty numeric field into a number or null. */
function num(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Parse an integer field. */
function int(value) {
  const n = num(value);
  return n === null ? null : Math.trunc(n);
}

// ---------------------------------------------------------------------------
// Dashboard summary
// ---------------------------------------------------------------------------

ticketRouter.get('/dashboard/summary', async (req, res, next) => {
  try {
    const totals = await queryOne(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END)            AS open_count,
         SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END)    AS in_progress_count,
         SUM(CASE WHEN status = 'pending_customer' THEN 1 ELSE 0 END) AS pending_count,
         SUM(CASE WHEN status = 'escalated' THEN 1 ELSE 0 END)       AS escalated_count,
         SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END)        AS resolved_count,
         SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END)          AS closed_count,
         SUM(CASE WHEN created_at >= CURDATE() THEN 1 ELSE 0 END)    AS created_today,
         SUM(CASE WHEN created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS created_7d
       FROM tickets`
    );

    const sla = await slaSummary();

    const byStatus = await query(
      `SELECT status, COUNT(*) AS count FROM tickets GROUP BY status`
    );

    const byChannel = await query(
      `SELECT COALESCE(ch.name, 'Unassigned') AS channel_name,
              COALESCE(ch.icon, 'bi-inbox')   AS channel_icon,
              COUNT(t.id)                     AS count
         FROM m_report_channel ch
         LEFT JOIN tickets t ON t.channel_id = ch.id
        GROUP BY ch.id, ch.name, ch.icon, ch.sort_order
        ORDER BY ch.sort_order`
    );

    const recent = await query(
      `SELECT id, ticket_number, title, status, priority_name, priority_color,
              service_type_name, created_at, sla_overdue
         FROM v_ticket_list
        ORDER BY created_at DESC LIMIT 8`
    );

    const topCid = await query(
      `SELECT cid, COUNT(*) AS count
         FROM tickets
        WHERE cid IS NOT NULL AND cid <> ''
        GROUP BY cid ORDER BY count DESC LIMIT 5`
    );

    const trend = await query(
      `SELECT DATE(created_at) AS day, COUNT(*) AS count
         FROM tickets
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
        GROUP BY DATE(created_at)
        ORDER BY day`
    );

    res.json({ data: { totals, sla, by_status: byStatus, by_channel: byChannel, recent, top_cid: topCid, trend } });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// List & filter
// ---------------------------------------------------------------------------

ticketRouter.get('/', async (req, res, next) => {
  try {
    const where = [];
    const params = [];

    if (req.query.status) {
      const list = String(req.query.status).split(',').filter((s) => STATUSES.includes(s));
      if (list.length) {
        where.push(`v.status IN (${list.map(() => '?').join(',')})`);
        params.push(...list);
      }
    }
    if (req.query.priority_id) { where.push('v.priority_id = ?'); params.push(req.query.priority_id); }
    if (req.query.service_type_id) { where.push('v.service_type_id = ?'); params.push(req.query.service_type_id); }
    if (req.query.channel_id) { where.push('v.channel_id = ?'); params.push(req.query.channel_id); }
    if (req.query.pop_id) { where.push('v.pop_id = ?'); params.push(req.query.pop_id); }
    if (req.query.assigned_to) { where.push('v.assigned_to = ?'); params.push(req.query.assigned_to); }
    if (req.query.cid) { where.push('v.cid LIKE ?'); params.push(`%${req.query.cid}%`); }
    if (req.query.isp_id) { where.push('v.isp_id = ?'); params.push(req.query.isp_id); }
    if (req.query.customer_id) { where.push('v.customer_id = ?'); params.push(req.query.customer_id); }
    if (req.query.search) {
      where.push('(v.title LIKE ? OR v.ticket_number LIKE ? OR v.cid LIKE ? OR v.link_name LIKE ? OR v.description LIKE ?)');
      const q = `%${req.query.search}%`;
      params.push(q, q, q, q, q);
    }
    if (req.query.overdue === '1') {
      where.push(`v.sla_overdue = 1`);
    }
    if (req.query.date_from) { where.push('v.created_at >= ?'); params.push(req.query.date_from); }
    if (req.query.date_to) { where.push('v.created_at <= ?'); params.push(req.query.date_to + ' 23:59:59'); }

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    // NOTE: the view alias must not be `t` — the view already aliases `tickets` as `t`
    // internally, and MySQL would resolve `t.sla_overdue` against the inner table.
    const rows = await query(
      `SELECT * FROM v_ticket_list v ${whereSql} ORDER BY v.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const countRow = await queryOne(
      `SELECT COUNT(*) AS count FROM v_ticket_list v ${whereSql}`,
      params
    );

    res.json({ data: rows, count: countRow.count, limit, offset });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// SLA policies (read)
// ---------------------------------------------------------------------------

ticketRouter.get('/sla/policies', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT p.*, st.name AS service_type_name, st.code AS service_type_code,
              pr.name AS priority_name, pr.code AS priority_code, pr.color AS priority_color
         FROM m_sla_policy p
         JOIN m_service_type st ON st.id = p.service_type_id
         JOIN m_priority pr      ON pr.id = p.priority_id
        ${req.query.service_type_id ? 'WHERE p.service_type_id = ?' : ''}
        ORDER BY st.sort_order, pr.sort_order`,
      req.query.service_type_id ? [req.query.service_type_id] : []
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

/** Preview the SLA a given service type + priority would apply. */
ticketRouter.get('/sla/preview', async (req, res, next) => {
  try {
    const { service_type_id, priority_id } = req.query;
    if (!service_type_id || !priority_id) {
      return res.status(400).json({ error: 'service_type_id and priority_id are required' });
    }
    const policy = await resolvePolicy(service_type_id, priority_id);
    if (!policy) return res.status(404).json({ error: 'No SLA policy found for that combination' });
    res.json({ data: policy });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

ticketRouter.post('/', requireRole('admin', 'noc', 'engineer'), async (req, res, next) => {
  try {
    const b = req.body || {};

    const serviceTypeId = int(b.service_type_id);
    const priorityId = int(b.priority_id);
    if (!serviceTypeId) return res.status(400).json({ error: 'service_type_id is required' });
    if (!priorityId) return res.status(400).json({ error: 'priority_id is required' });
    if (!b.title || !String(b.title).trim()) {
      return res.status(400).json({ error: 'title is required' });
    }

    const svc = await queryOne('SELECT id, code FROM m_service_type WHERE id = ? LIMIT 1', [serviceTypeId]);
    if (!svc) return res.status(400).json({ error: 'Invalid service_type_id' });
    const pri = await queryOne('SELECT id FROM m_priority WHERE id = ? LIMIT 1', [priorityId]);
    if (!pri) return res.status(400).json({ error: 'Invalid priority_id' });

    // Auto-fill ISP name from the selected link when not supplied.
    let linkName = b.link_name ?? null;
    let ispId = int(b.isp_id);
    let ispName = b.isp_name ?? null;
    const linkId = int(b.link_id);
    if (linkId) {
      const link = await queryOne(
        `SELECT l.*, i.name AS isp_name FROM m_link l LEFT JOIN m_isp i ON i.id = l.isp_id WHERE l.id = ?`,
        [linkId]
      );
      if (link) {
        linkName = linkName || link.link_name;
        ispId = ispId || link.isp_id;
        ispName = ispName || link.isp_name;
        if (!b.cid && link.cid) b.cid = link.cid;
      }
    }

    const ticketNumber = await nextTicketNumber(svc.code);
    const status = STATUSES.includes(b.status) ? b.status : 'open';

    const result = await transaction(async (conn) => {
      const [res2] = await conn.query(
        `INSERT INTO tickets (
           ticket_number, service_type_id, title, description,
           cid, link_id, link_name, isp_id, isp_name, pop_id, ms_splitter_id,
           mac_address, serial_number, vlan_id, signal_input_cpe_dbm, latitude, longitude,
           priority_id, channel_id, customer_id, customer_name, reported_by, reporter_contact,
           status, assigned_to, team, created_by
         ) VALUES (?,?,?,?, ?,?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?)`,
        [
          ticketNumber, serviceTypeId, String(b.title).trim(), b.description ?? null,
          b.cid ?? null, linkId, linkName, ispId, ispName, int(b.pop_id), int(b.ms_splitter_id),
          b.mac_address ?? null, b.serial_number ?? null, b.vlan_id ?? null,
          num(b.signal_input_cpe_dbm), num(b.latitude), num(b.longitude),
          priorityId, int(b.channel_id), int(b.customer_id), b.customer_name ?? null,
          b.reported_by ?? null, b.reporter_contact ?? null,
          status, int(b.assigned_to) || req.user.id, b.team ?? null, req.user.id,
        ]
      );
      const ticketId = res2.insertId;

      await logEvent(conn, ticketId, 'created', {
        to: ticketNumber,
        note: `Ticket created with priority #${priorityId}`,
        userId: req.user.id,
      });

      return ticketId;
    });

    // SLA clock
    await syncTicketSla(result, { serviceTypeId, priorityId });

    const row = await queryOne('SELECT * FROM v_ticket_list WHERE id = ?', [result]);
    res.status(201).json({ data: row, message: 'Ticket created' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Read one
// ---------------------------------------------------------------------------

ticketRouter.get('/:id', async (req, res, next) => {
  try {
    const row = await queryOne('SELECT * FROM v_ticket_list WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Ticket not found' });

    const events = await query(
      `SELECT e.*, u.full_name AS user_name
         FROM ticket_events e
         LEFT JOIN users u ON u.id = e.created_by
        WHERE e.ticket_id = ?
        ORDER BY e.created_at ASC, e.id ASC`,
      [req.params.id]
    );

    const sla = await queryOne('SELECT * FROM ticket_sla WHERE ticket_id = ?', [req.params.id]);

    res.json({ data: row, events, sla });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Update fields
// ---------------------------------------------------------------------------

const EDITABLE = [
  'title', 'description', 'cid', 'link_id', 'link_name', 'isp_id', 'isp_name',
  'pop_id', 'ms_splitter_id', 'mac_address', 'serial_number', 'vlan_id',
  'signal_input_cpe_dbm', 'latitude', 'longitude', 'priority_id', 'channel_id',
  'customer_id', 'customer_name', 'reported_by', 'reporter_contact', 'team',
  'resolution_note', 'root_cause', 'service_type_id',
];

ticketRouter.put('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await queryOne('SELECT * FROM tickets WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });

    const b = req.body || {};
    const updates = {};
    for (const col of EDITABLE) {
      if (!Object.prototype.hasOwnProperty.call(b, col)) continue;
      if (['signal_input_cpe_dbm', 'latitude', 'longitude'].includes(col)) {
        updates[col] = num(b[col]);
      } else if (['link_id', 'isp_id', 'pop_id', 'ms_splitter_id', 'priority_id',
                 'channel_id', 'customer_id', 'service_type_id'].includes(col)) {
        updates[col] = int(b[col]);
      } else {
        updates[col] = b[col];
      }
    }
    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No valid fields supplied' });
    }

    const cols = Object.keys(updates);
    await execute(
      `UPDATE tickets SET ${cols.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`,
      [...cols.map((c) => updates[c]), id]
    );

    // Priority or service type changed → recompute SLA
    const priorityId = updates.priority_id ?? existing.priority_id;
    const serviceTypeId = updates.service_type_id ?? existing.service_type_id;
    if (updates.priority_id && updates.priority_id !== existing.priority_id) {
      await syncTicketSla(id, { serviceTypeId, priorityId, reset: true });
      await logEvent(null, id, 'priority_change', {
        from: existing.priority_id, to: priorityId, userId: req.user.id,
      });
    } else if (updates.service_type_id && updates.service_type_id !== existing.service_type_id) {
      await syncTicketSla(id, { serviceTypeId, priorityId, reset: true });
    }

    await logEvent(null, id, 'field_update', {
      note: `Updated: ${cols.join(', ')}`,
      userId: req.user.id,
    });

    const row = await queryOne('SELECT * FROM v_ticket_list WHERE id = ?', [id]);
    res.json({ data: row, message: 'Updated' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Status transition
// ---------------------------------------------------------------------------

ticketRouter.post('/:id/status', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await queryOne('SELECT * FROM tickets WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });

    const to = req.body?.status;
    if (!STATUSES.includes(to)) {
      return res.status(400).json({ error: `Invalid status. Allowed: ${STATUSES.join(', ')}` });
    }
    const note = req.body?.note ?? null;

    await execute(
      `UPDATE tickets
          SET status = ?,
              closed_at = CASE
                WHEN ? IN ('resolved','closed','cancelled') AND closed_at IS NULL THEN NOW()
                WHEN ? NOT IN ('resolved','closed','cancelled') THEN NULL
                ELSE closed_at END,
              resolution_note = COALESCE(?, resolution_note)
        WHERE id = ?`,
      [to, to, to, note, id]
    );

    // First engineer action counts as the first response
    if (['in_progress', 'escalated'].includes(to)) {
      await markFirstResponse(id);
    }

    // Pause / resume the SLA clock
    if (to === 'pending_customer') await pauseClock(id);
    else if (existing.status === 'pending_customer') await resumeClock(id);

    if (['resolved', 'closed'].includes(to)) await markResolved(id);

    await logEvent(null, id, 'status_change', {
      from: existing.status, to, note, userId: req.user.id,
    });

    const row = await queryOne('SELECT * FROM v_ticket_list WHERE id = ?', [id]);
    const sla = await queryOne('SELECT * FROM ticket_sla WHERE ticket_id = ?', [id]);
    res.json({ data: row, sla, message: 'Status updated' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

ticketRouter.post('/:id/assign', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await queryOne('SELECT * FROM tickets WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });

    const assigneeId = int(req.body?.assigned_to);
    let assigneeName = null;
    if (assigneeId) {
      const u = await queryOne('SELECT id, full_name FROM users WHERE id = ? LIMIT 1', [assigneeId]);
      if (!u) return res.status(400).json({ error: 'Invalid assignee' });
      assigneeName = u.full_name;
    }

    await execute('UPDATE tickets SET assigned_to = ? WHERE id = ?', [assigneeId, id]);
    await logEvent(null, id, 'assigned', {
      from: existing.assigned_to, to: assigneeName, userId: req.user.id,
    });

    const row = await queryOne('SELECT * FROM v_ticket_list WHERE id = ?', [id]);
    res.json({ data: row, message: 'Assigned' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Timeline note
// ---------------------------------------------------------------------------

ticketRouter.post('/:id/events', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await queryOne('SELECT id FROM tickets WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });

    const note = req.body?.note;
    if (!note || !String(note).trim()) {
      return res.status(400).json({ error: 'note is required' });
    }
    await logEvent(null, id, req.body?.event_type || 'note', {
      note: String(note).trim(), userId: req.user.id,
    });
    res.status(201).json({ message: 'Note added' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Delete (admin only)
// ---------------------------------------------------------------------------

ticketRouter.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await execute('DELETE FROM tickets WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ message: 'Ticket deleted' });
  } catch (err) {
    next(err);
  }
});
