/**
 * SYNOC — master data CRUD routes.
 *
 * Generic, table-driven CRUD over the master data tables, with a small
 * whitelist per table so no user input ever reaches an identifier.
 */
import { Router } from 'express';
import { query, queryOne, execute } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

export const masterRouter = Router();

/**
 * Each entry defines the table, the editable columns, and default filters.
 * `label` is used for option lists (dropdowns).
 */
const RESOURCES = {
  service_type: {
    table: 'm_service_type',
    columns: ['code', 'name', 'description', 'is_active', 'sort_order'],
    order: 'sort_order, name',
    label: 'name',
    extra: { code: 'name' },
  },
  priority: {
    table: 'm_priority',
    columns: ['code', 'name', 'level', 'response_hours', 'resolution_hours', 'color', 'is_active', 'sort_order'],
    order: 'sort_order, level DESC',
    label: 'name',
    extra: { code: 'name', response_hours: 'response_hours', resolution_hours: 'resolution_hours' },
  },
  channel: {
    table: 'm_report_channel',
    columns: ['code', 'name', 'icon', 'is_active', 'sort_order'],
    order: 'sort_order, name',
    label: 'name',
    extra: { code: 'name' },
  },
  customer: {
    table: 'm_customer',
    columns: ['code', 'name', 'contact_name', 'contact_phone', 'contact_email', 'address', 'is_active'],
    order: 'name',
    label: 'name',
    extra: { code: 'name' },
  },
  isp: {
    table: 'm_isp',
    columns: ['code', 'name', 'contact_name', 'contact_phone', 'contact_email', 'is_active'],
    order: 'name',
    label: 'name',
    extra: { code: 'name' },
  },
  pop: {
    table: 'm_pop',
    columns: ['code', 'name', 'city', 'province', 'address', 'lat', 'lng', 'is_active'],
    order: 'name',
    label: 'name',
    extra: { code: 'name' },
  },
  ms_splitter: {
    table: 'm_ms_splitter',
    columns: ['code', 'type', 'name', 'pop_id', 'mac_address', 'serial_number', 'status', 'is_active'],
    order: 'name',
    label: 'name',
    extra: { code: 'name', type: 'type' },
    joins: `LEFT JOIN m_pop p ON p.id = m.pop_id`,
    select: `m.*, p.name AS pop_name, p.code AS pop_code`,
  },
  link: {
    table: 'm_link',
    columns: ['code', 'link_name', 'isp_id', 'customer_id', 'cid', 'bandwidth', 'media_type', 'site_a', 'site_b', 'is_active'],
    order: 'link_name',
    label: 'link_name',
    extra: { code: 'link_name', cid: 'cid', isp_id: 'isp_id' },
    joins: `LEFT JOIN m_isp i ON i.id = m.isp_id LEFT JOIN m_customer c ON c.id = m.customer_id`,
    select: `m.*, i.name AS isp_name, c.name AS customer_name`,
  },
  sla_policy: {
    table: 'm_sla_policy',
    columns: ['name', 'service_type_id', 'priority_id', 'response_hours', 'resolution_hours',
              'escalation_hours', 'pause_on_customer_wait', 'business_hours_only', 'description', 'is_active'],
    order: 'service_type_id, priority_id',
    label: 'name',
    extra: { name: 'name' },
    joins: `JOIN m_service_type st ON st.id = m.service_type_id JOIN m_priority p ON p.id = m.priority_id`,
    select: `m.*, st.name AS service_type_name, st.code AS service_type_code,
             p.name AS priority_name, p.code AS priority_code`,
  },
};

masterRouter.use(requireAuth);

function resourceFor(req, res) {
  const res_ = RESOURCES[req.params.resource];
  if (!res_) {
    res.status(404).json({ error: `Unknown master data resource: ${req.params.resource}` });
    return null;
  }
  return res_;
}

/** GET /api/master — resource catalogue for the UI. */
masterRouter.get('/', (req, res) => {
  res.json({
    resources: Object.entries(RESOURCES).map(([key, def]) => ({
      key,
      table: def.table,
      columns: def.columns,
    })),
  });
});

/** GET /api/master/:resource — list rows. */
masterRouter.get('/:resource', async (req, res, next) => {
  const def = resourceFor(req, res);
  if (!def) return;

  const where = [];
  const params = [];
  if (req.query.active_only === '1') where.push('m.is_active = 1');
  if (req.query.search) {
    where.push('(m.name LIKE ? OR m.code LIKE ?)');
    params.push(`%${req.query.search}%`, `%${req.query.search}%`);
  }

  const select = def.select || 'm.*';
  const joins = def.joins || '';
  const sql = `
    SELECT ${select}
      FROM \`${def.table}\` m
      ${joins}
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY ${def.order}
  `;
  try {
    const rows = await query(sql, params);
    res.json({ data: rows, count: rows.length });
  } catch (err) {
    next(err);
  }
});

/** GET /api/master/:resource/options — lightweight list for dropdowns. */
masterRouter.get('/:resource/options', async (req, res, next) => {
  const def = resourceFor(req, res);
  if (!def) return;

  const extraCols = Object.entries(def.extra || {})
    .map(([alias, col]) => `${col} AS ${alias}`)
    .join(', ');
  const select = `m.id, m.${def.label} AS label${extraCols ? ', ' + extraCols : ''}`;
  try {
    const rows = await query(
      `SELECT ${select} FROM \`${def.table}\` m WHERE m.is_active = 1 ORDER BY ${def.order}`
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

/** GET /api/master/:resource/:id — single row. */
masterRouter.get('/:resource/:id', async (req, res, next) => {
  const def = resourceFor(req, res);
  if (!def) return;
  const select = def.select || 'm.*';
  try {
    const row = await queryOne(
      `SELECT ${select} FROM \`${def.table}\` m ${def.joins || ''} WHERE m.id = ? LIMIT 1`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Record not found' });
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
});

/** POST /api/master/:resource — create. */
masterRouter.post('/:resource', requireRole('admin', 'noc'), async (req, res, next) => {
  const def = resourceFor(req, res);
  if (!def) return;

  const payload = {};
  for (const col of def.columns) {
    if (Object.prototype.hasOwnProperty.call(req.body, col)) payload[col] = req.body[col];
  }
  if (!Object.keys(payload).length) {
    return res.status(400).json({ error: 'No valid fields supplied' });
  }

  const cols = Object.keys(payload);
  const placeholders = cols.map(() => '?').join(', ');
  try {
    const result = await execute(
      `INSERT INTO \`${def.table}\` (${cols.map((c) => `\`${c}\``).join(', ')})
       VALUES (${placeholders})`,
      cols.map((c) => payload[c])
    );
    const row = await queryOne(
      `SELECT ${def.select || 'm.*'} FROM \`${def.table}\` m ${def.joins || ''} WHERE m.id = ? LIMIT 1`,
      [result.insertId]
    );
    res.status(201).json({ data: row, message: 'Created' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `Duplicate value for ${cols.find((c) => String(err.sqlMessage).includes(`\`${c}\``)) || 'unique field'}` });
    }
    next(err);
  }
});

/** PUT /api/master/:resource/:id — update. */
masterRouter.put('/:resource/:id', requireRole('admin', 'noc'), async (req, res, next) => {
  const def = resourceFor(req, res);
  if (!def) return;

  const payload = {};
  for (const col of def.columns) {
    if (Object.prototype.hasOwnProperty.call(req.body, col)) payload[col] = req.body[col];
  }
  if (!Object.keys(payload).length) {
    return res.status(400).json({ error: 'No valid fields supplied' });
  }

  const cols = Object.keys(payload);
  try {
    const result = await execute(
      `UPDATE \`${def.table}\` SET ${cols.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`,
      [...cols.map((c) => payload[c]), req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Record not found' });
    const row = await queryOne(
      `SELECT ${def.select || 'm.*'} FROM \`${def.table}\` m ${def.joins || ''} WHERE m.id = ? LIMIT 1`,
      [req.params.id]
    );
    res.json({ data: row, message: 'Updated' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Duplicate value for a unique field' });
    }
    next(err);
  }
});

/** DELETE /api/master/:resource/:id — delete (soft when is_active exists). */
masterRouter.delete('/:resource/:id', requireRole('admin'), async (req, res, next) => {
  const def = resourceFor(req, res);
  if (!def) return;

  try {
    const existing = await queryOne(`SELECT id FROM \`${def.table}\` WHERE id = ? LIMIT 1`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Record not found' });

    if (def.columns.includes('is_active')) {
      await execute(`UPDATE \`${def.table}\` SET is_active = 0 WHERE id = ?`, [req.params.id]);
      return res.json({ message: 'Deactivated' });
    }
    await execute(`DELETE FROM \`${def.table}\` WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'Record is referenced by other data and cannot be deleted' });
    }
    next(err);
  }
});
