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
    extra: { code: 'code' },
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
  branch: {
    table: 'm_branch',
    columns: ['code', 'name', 'regional', 'city', 'province', 'address', 'phone', 'manager', 'is_active'],
    order: 'name',
    label: 'name',
    extra: { code: 'code', regional: 'regional' },
  },
  pic: {
    table: 'm_pic',
    columns: ['code', 'name', 'position', 'department', 'phone', 'email', 'regional', 'is_active'],
    order: 'name',
    label: 'name',
    extra: { name: 'name', code: 'code', position: 'position', regional: 'regional' },
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
    // Kode asli + kota/provinsi supaya pencarian pada dropdown POP bisa
    // mencocokkan kode maupun lokasi.
    extra: { code: 'code', city: 'city', province: 'province' },
  },
  ms_splitter: {
    table: 'm_ms_splitter',
    columns: ['code', 'type', 'name', 'pop_id', 'mac_address', 'serial_number', 'status', 'is_active'],
    order: 'name',
    label: 'name',
    // Kode asli + tipe + status untuk pencarian & petunjuk (hint).
    extra: { code: 'code', type: 'type', status: 'status' },
    joins: `LEFT JOIN m_pop p ON p.id = m.pop_id`,
    select: `m.*, p.name AS pop_name, p.code AS pop_code`,
    // Dipakai oleh endpoint /options: nama POP ikut diambil agar dropdown
    // MS / Splitter bisa menampilkan & mencari berdasarkan POP-nya.
    optionsJoins: `LEFT JOIN m_pop p ON p.id = m.pop_id`,
    optionsExtra: `p.name AS pop_name`,
    optionsOrder: 'm.name',
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

/**
 * Column metadata per table: which columns are NOT NULL, whether they have a
 * default and whether they are auto-increment.
 *
 * Cached per table because the schema does not change at runtime.
 */
const columnCache = new Map();

async function columnMeta(table) {
  if (columnCache.has(table)) return columnCache.get(table);

  const rows = await query(
    `SELECT COLUMN_NAME, COLUMN_DEFAULT, EXTRA, DATA_TYPE, IS_NULLABLE
       FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );

  const meta = new Map();
  for (const r of rows) {
    const autoIncrement = String(r.EXTRA).includes('auto_increment');
    meta.set(String(r.COLUMN_NAME).toLowerCase(), {
      notNull: String(r.IS_NULLABLE).toUpperCase() === 'NO',
      hasDefault: r.COLUMN_DEFAULT !== null || autoIncrement,
      autoIncrement,
      numeric: /^(int|decimal|float|double)/i.test(String(r.DATA_TYPE)),
    });
  }
  columnCache.set(table, meta);
  return meta;
}

/**
 * Strip values that the column cannot accept.
 *
 * - NULL / empty string for a NOT NULL column with a default → the column is
 *   removed from the statement so the database default applies.
 * - NULL / empty string for a NOT NULL column WITHOUT a default → the column
 *   is mandatory and the request is rejected with a clear message.
 *
 * Returns `null` when a required value is missing.
 */
function sanitizePayload(payload, meta) {
  for (const [col, value] of Object.entries(payload)) {
    const info = meta.get(col);
    if (!info || !info.notNull) continue;
    if (value !== null && value !== undefined && value !== '') continue;

    if (info.hasDefault) {
      delete payload[col];
    } else {
      return col;
    }
  }
  return null;
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
    // The searchable columns differ per table: `m_link` has `link_name`
    // instead of `name`, and `m_sla_policy` has no `code` column at all.
    const searchCols = [def.label];
    if (def.columns.includes('code') && !searchCols.includes('code')) searchCols.push('code');
    where.push(`(${searchCols.map((c) => `m.${c} LIKE ?`).join(' OR ')})`);
    params.push(...searchCols.map(() => `%${req.query.search}%`));
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
    .map(([alias, col]) => `m.${col} AS ${alias}`)
    .join(', ');
  const extra = [extraCols, def.optionsExtra].filter(Boolean).join(', ');
  const select = `m.id, m.${def.label} AS label${extra ? ', ' + extra : ''}`;
  const joins = def.optionsJoins ? ` ${def.optionsJoins}` : '';
  // Default ORDER BY tetap `def.order`; resource yang memakai JOIN mengganti
  //nya lewat `optionsOrder` (mis. "name" jadi ambigu saat join m_pop).
  const order = def.optionsOrder || def.order;
  try {
    const rows = await query(
      `SELECT ${select} FROM \`${def.table}\` m${joins} WHERE m.is_active = 1 ORDER BY ${order}`
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

  // Kolom NOT NULL tanpa nilai akan menggagalkan INSERT (500). Kolom yang
  // punya default cukup dikosongkan agar default database yang dipakai.
  const meta = await columnMeta(def.table);
  const missingRequired = sanitizePayload(payload, meta);
  if (missingRequired) {
    return res.status(400).json({ error: `Kolom "${missingRequired}" wajib diisi` });
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
    await execute(
      `INSERT INTO audit_log (entity, entity_id, action, changes, created_by)
       VALUES (?, ?, 'create', ?, ?)`,
      [def.table, String(result.insertId), JSON.stringify(payload), req.user?.id ?? null]
    ).catch(() => { /* audit is best-effort */ });
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

  // Kolom NOT NULL tidak boleh dikosongkan. Untuk kolom yang punya default,
  // kosongkan saja (nilai lama dipertahankan). Untuk kolom wajib tanpa
  // default, tolong permintaan dengan pesan yang jelas.
  const meta = await columnMeta(def.table);
  const missingRequired = sanitizePayload(payload, meta);
  if (missingRequired) {
    return res.status(400).json({ error: `Kolom "${missingRequired}" tidak boleh dikosongkan` });
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
    await execute(
      `INSERT INTO audit_log (entity, entity_id, action, changes, created_by)
       VALUES (?, ?, 'update', ?, ?)`,
      [def.table, String(req.params.id), JSON.stringify(payload), req.user?.id ?? null]
    ).catch(() => { /* audit is best-effort */ });
    res.json({ data: row, message: 'Updated' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Duplicate value for a unique field' });
    }
    next(err);
  }
});

/**
 * DELETE /api/master/:resource/:id — hard delete.
 *
 * The row is removed from the table for good (no soft delete), so it
 * disappears from the list and from the dropdown options as well.
 * Referencing rows are handled by the foreign keys:
 *   - `ON DELETE SET NULL`  → the reference on the other table is cleared
 *   - `ON DELETE CASCADE`   → the dependent rows are removed too
 *   - `RESTRICT` (default)  → the delete is refused with HTTP 409
 */
masterRouter.delete('/:resource/:id', requireRole('admin'), async (req, res, next) => {
  const def = resourceFor(req, res);
  if (!def) return;

  try {
    const existing = await queryOne(
      `SELECT * FROM \`${def.table}\` WHERE id = ? LIMIT 1`,
      [req.params.id]
    );
    if (!existing) return res.status(404).json({ error: 'Record not found' });

    const result = await execute(`DELETE FROM \`${def.table}\` WHERE id = ?`, [req.params.id]);
    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Record not found' });
    }

    // Keep a trace of the destructive operation.
    await execute(
      `INSERT INTO audit_log (entity, entity_id, action, changes, created_by)
       VALUES (?, ?, 'delete', ?, ?)`,
      [
        def.table,
        String(req.params.id),
        JSON.stringify({ deleted: existing }),
        req.user?.id ?? null,
      ]
    ).catch(() => { /* audit is best-effort, never block the delete */ });

    res.json({ message: 'Deleted', data: { id: Number(req.params.id) } });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(409).json({
        error: 'Data masih dipakai oleh data lain (tiket atau kebijakan SLA) sehingga tidak bisa dihapus. '
             + 'Nonaktifkan saja bila hanya ingin menyembunyikannya.',
      });
    }
    next(err);
  }
});
