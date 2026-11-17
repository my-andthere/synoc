/**
 * SYNOC — master data CRUD view.
 *
 * Each resource has a declared column schema (label, type, options) that
 * drives both the table and the create/edit form.
 */
import { api } from '../lib/api.js';
import { esc, options, toast, openModal, closeModal, emptyState } from '../lib/ui.js';

/** Column schema per master-data resource. */
const SCHEMA = {
  service_type: {
    title: 'Jenis Layanan',
    icon: 'bi-diagram-3',
    desc: 'Kategori layanan yanghandled NOC.',
    columns: [
      { key: 'code', label: 'Kode', type: 'text', required: true },
      { key: 'name', label: 'Nama', type: 'text', required: true },
      { key: 'description', label: 'Deskripsi', type: 'textarea' },
      { key: 'sort_order', label: 'Urutan', type: 'number' },
      { key: 'is_active', label: 'Aktif', type: 'bool' },
    ],
  },
  priority: {
    title: 'Priority',
    icon: 'bi-flag',
    desc: 'Prioritas tiket beserta target waktu SLA bawaan.',
    columns: [
      { key: 'code', label: 'Kode', type: 'text', required: true },
      { key: 'name', label: 'Nama', type: 'text', required: true },
      { key: 'level', label: 'Level', type: 'number' },
      { key: 'response_hours', label: 'Response (jam)', type: 'number' },
      { key: 'resolution_hours', label: 'Resolusi (jam)', type: 'number' },
      { key: 'color', label: 'Warna', type: 'color' },
      { key: 'sort_order', label: 'Urutan', type: 'number' },
      { key: 'is_active', label: 'Aktif', type: 'bool' },
    ],
  },
  channel: {
    title: 'Kanal Pelaporan',
    icon: 'bi-envelope',
    desc: 'Saluran pengaduan yang diterima NOC.',
    columns: [
      { key: 'code', label: 'Kode', type: 'text', required: true },
      { key: 'name', label: 'Nama', type: 'text', required: true },
      { key: 'icon', label: 'Ikon', type: 'icon' },
      { key: 'sort_order', label: 'Urutan', type: 'number' },
      { key: 'is_active', label: 'Aktif', type: 'bool' },
    ],
  },
  customer: {
    title: 'Customer',
    icon: 'bi-building',
    desc: 'Master data pelanggan yang dilayani.',
    columns: [
      { key: 'code', label: 'Kode', type: 'text', required: true },
      { key: 'name', label: 'Nama', type: 'text', required: true },
      { key: 'contact_name', label: 'Nama Kontak', type: 'text' },
      { key: 'contact_phone', label: 'Telepon', type: 'text' },
      { key: 'contact_email', label: 'Email', type: 'email' },
      { key: 'address', label: 'Alamat', type: 'textarea' },
      { key: 'is_active', label: 'Aktif', type: 'bool' },
    ],
  },
  isp: {
    title: 'ISP',
    icon: 'bi-globe',
    desc: 'Master data Internet Service Provider.',
    columns: [
      { key: 'code', label: 'Kode', type: 'text', required: true },
      { key: 'name', label: 'Nama', type: 'text', required: true },
      { key: 'contact_name', label: 'Nama Kontak', type: 'text' },
      { key: 'contact_phone', label: 'Telepon', type: 'text' },
      { key: 'contact_email', label: 'Email', type: 'email' },
      { key: 'is_active', label: 'Aktif', type: 'bool' },
    ],
  },
  pop: {
    title: 'POP (Point of Presence)',
    icon: 'bi-geo-alt',
    desc: 'Lokasi Point of Presence.',
    columns: [
      { key: 'code', label: 'Kode', type: 'text', required: true },
      { key: 'name', label: 'Nama', type: 'text', required: true },
      { key: 'city', label: 'Kota', type: 'text' },
      { key: 'province', label: 'Provinsi', type: 'text' },
      { key: 'address', label: 'Alamat', type: 'textarea' },
      { key: 'lat', label: 'Latitude', type: 'number' },
      { key: 'lng', label: 'Longitude', type: 'number' },
      { key: 'is_active', label: 'Aktif', type: 'bool' },
    ],
  },
  ms_splitter: {
    title: 'MS / Splitter',
    icon: 'bi-usb-plug',
    desc: 'Perangkat MS, splitter, ONT, dan CPE.',
    columns: [
      { key: 'code', label: 'Kode', type: 'text', required: true },
      { key: 'type', label: 'Tipe', type: 'select', options: ['MS', 'Splitter', 'ONT', 'CPE'] },
      { key: 'name', label: 'Nama', type: 'text', required: true },
      { key: 'pop_id', label: 'POP', type: 'master', master: 'pop' },
      { key: 'mac_address', label: 'MAC Address', type: 'text' },
      { key: 'serial_number', label: 'Serial Number', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['active', 'reserved', 'decommissioned'] },
      { key: 'is_active', label: 'Aktif', type: 'bool' },
    ],
  },
  link: {
    title: 'Link',
    icon: 'bi-link-45deg',
    desc: 'Master data link jaringan beserta ISP dan customer.',
    columns: [
      { key: 'code', label: 'Kode', type: 'text', required: true },
      { key: 'link_name', label: 'Link Name', type: 'text', required: true },
      { key: 'isp_id', label: 'ISP', type: 'master', master: 'isp' },
      { key: 'customer_id', label: 'Customer', type: 'master', master: 'customer' },
      { key: 'cid', label: 'CID', type: 'text' },
      { key: 'bandwidth', label: 'Bandwidth', type: 'text' },
      { key: 'media_type', label: 'Media', type: 'text' },
      { key: 'site_a', label: 'Site A', type: 'text' },
      { key: 'site_b', label: 'Site B', type: 'text' },
      { key: 'is_active', label: 'Aktif', type: 'bool' },
    ],
  },
  sla_policy: {
    title: 'Kebijakan SLA',
    icon: 'bi-list-check',
    desc: 'Aturan SLA per kombinasi Jenis Layanan × Priority.',
    columns: [
      { key: 'name', label: 'Nama Kebijakan', type: 'text', required: true },
      { key: 'service_type_id', label: 'Jenis Layanan', type: 'master', master: 'service_type', required: true },
      { key: 'priority_id', label: 'Priority', type: 'master', master: 'priority', required: true },
      { key: 'response_hours', label: 'Response (jam)', type: 'number' },
      { key: 'resolution_hours', label: 'Resolusi (jam)', type: 'number' },
      { key: 'escalation_hours', label: 'Eskalasi (jam)', type: 'number' },
      { key: 'pause_on_customer_wait', label: 'Jeda Menunggu Customer', type: 'bool' },
      { key: 'business_hours_only', label: 'Hanya Jam Kerja', type: 'bool' },
      { key: 'description', label: 'Keterangan', type: 'textarea' },
      { key: 'is_active', label: 'Aktif', type: 'bool' },
    ],
  },
};

/** Master-data option caches, filled lazily per form render. */
const masterCache = new Map();

/**
 * Bootstrap Icons offered when picking a channel icon.
 * Values are the icon class names without the `bi ` prefix.
 */
const ICON_CHOICES = [
  'bi-pencil-square', 'bi-envelope', 'bi-telegram', 'bi-chat-dots',
  'bi-chat-square-text', 'bi-telephone', 'bi-globe', 'bi-person',
  'bi-whatsapp', 'bi-slack', 'bi-ticket-perforated', 'bi-broadcast',
  'bi-headset', 'bi-inbox', 'bi-journal-text', 'bi-megaphone',
];
window.BI_ICON_CHOICES = ICON_CHOICES;

export async function renderMaster(container, resource) {
  const schema = SCHEMA[resource];
  if (!schema) {
    container.innerHTML = emptyState('bi-question-circle', `Master data "${resource}" tidak dikenal`);
    return;
  }

  container.innerHTML = `<div class="skeleton" style="height:400px"></div>`;
  const { data: rows } = await api.masterList(resource);

  // Columns shown in the table (max 5), excluding `is_active` which gets
  // its own dedicated status column below.
  const shown = schema.columns.filter((c) => c.key !== 'is_active').slice(0, 5);

  container.innerHTML = `
    <div class="card" style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
      <div>
        <h3 style="font-size:1.05rem"><i class="bi ${esc(schema.icon)}"></i> ${esc(schema.title)}</h3>
        <p class="muted">${esc(schema.desc)}</p>
      </div>
      <button class="btn btn-primary btn-sm" id="mdNew"><i class="bi bi-plus-lg"></i> Tambah ${esc(schema.title)}</button>
    </div>

    ${rows.length ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              ${shown.map((c) => `<th>${esc(c.label)}</th>`).join('')}
              <th>Aktif</th>
              <th style="width:130px">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                ${shown.map((c) => `<td>${cellValue(c, row)}</td>`).join('')}
                <td>${row.is_active === 0 || row.is_active === undefined
                  ? '<span class="badge b-neutral">Nonaktif</span>'
                  : '<span class="badge b-ok">Aktif</span>'}</td>
                <td>
                  <button class="btn btn-xs btn-ghost" data-edit="${esc(row.id)}"><i class="bi bi-pencil"></i> Edit</button>
                  <button class="btn btn-xs btn-danger" data-del="${esc(row.id)}"><i class="bi bi-trash"></i> Hapus</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="muted" style="margin-top:10px">${esc(String(rows.length))} baris</p>
    ` : emptyState(schema.icon, `Belum ada data ${schema.title}`)}
  `;

  document.getElementById('mdNew').addEventListener('click', () => openForm(schema, resource, null));

  container.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = rows.find((r) => String(r.id) === btn.dataset.edit);
      openForm(schema, resource, row);
    });
  });

  container.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Nonaktifkan / hapus data ini?')) return;
      try {
        await api.masterDelete(resource, btn.dataset.del);
        toast('Data berhasil dihapus', 'ok');
        renderMaster(container, resource);
      } catch (err) { toast(err.message, 'err'); }
    });
  });
}

function cellValue(col, row) {
  const v = row[col.key];
  if (v === null || v === undefined || v === '') {
    if (col.type === 'master') return '—';
    return '<span class="dim">—</span>';
  }
  if (col.type === 'bool') return v ? 'Ya' : 'Tidak';
  if (col.key === 'icon') {
    return `<i class="bi ${esc(String(v))}"></i> <span class="muted mono" style="font-size:0.75rem">${esc(String(v))}</span>`;
  }
  if (col.type === 'master') {
    const nameKey = { pop: 'pop_name', isp: 'isp_name', customer: 'customer_name', service_type: 'service_type_name', priority: 'priority_name' }[col.master];
    return esc(row[nameKey] || v);
  }
  if (col.key === 'color') {
    return `<span class="pill" style="background:${esc(v)}22;color:${esc(v)};border-color:${esc(v)}55">${esc(v)}</span>`;
  }
  if (col.type === 'number') return `<span class="mono">${esc(String(v))}</span>`;
  return esc(String(v));
}

/** Load the option list for a `master`-type column. */
async function masterOptions(master) {
  if (!masterCache.has(master)) {
    const { data } = await api.masterOptions(master);
    masterCache.set(master, data);
  }
  return masterCache.get(master);
}

async function openForm(schema, resource, row) {
  const isEdit = Boolean(row);
  const masterCols = schema.columns.filter((c) => c.type === 'master');

  const optionLists = {};
  for (const col of masterCols) {
    optionLists[col.key] = await masterOptions(col.master);
  }

  const fields = schema.columns.map((col) => {
    const value = row ? row[col.key] : (col.type === 'bool' ? 1 : '');
    const req = col.required ? ' required' : '';

    if (col.type === 'master') {
      const opts = optionLists[col.key] || [];
      return `<label class="field">
        <span>${esc(col.label)}${col.required ? ' <span style="color:var(--danger)">*</span>' : ''}</span>
        <select name="${esc(col.key)}"${req}>
          ${options(opts, { selected: value, placeholder: '-- Pilih --' })}
        </select>
      </label>`;
    }
    if (col.type === 'select') {
      return `<label class="field">
        <span>${esc(col.label)}</span>
        <select name="${esc(col.key)}">
          ${options(col.options.map((o) => ({ id: o, label: o })), { selected: value })}
        </select>
      </label>`;
    }
    if (col.type === 'bool') {
      return `<label class="field">
        <span>${esc(col.label)}</span>
        <select name="${esc(col.key)}">
          <option value="1"${Number(value) === 1 ? ' selected' : ''}>Ya</option>
          <option value="0"${Number(value) === 0 ? ' selected' : ''}>Tidak</option>
        </select>
      </label>`;
    }
    if (col.type === 'textarea') {
      return `<label class="field">
        <span>${esc(col.label)}</span>
        <textarea name="${esc(col.key)}">${esc(value)}</textarea>
      </label>`;
    }
    if (col.type === 'icon') {
      const opts = (window.BI_ICON_CHOICES || []).slice();
      const list = opts.includes(value) ? opts : [...opts, value].filter(Boolean);
      return `<label class="field">
        <span>${esc(col.label)}</span>
        <select name="${esc(col.key)}">
          ${list.map((id) => `<option value="${esc(id)}"${id === value ? ' selected' : ''}>${esc(id)}</option>`).join('')}
        </select>
      </label>`;
    }
    if (col.type === 'color') {
      return `<label class="field">
        <span>${esc(col.label)}</span>
        <input type="color" name="${esc(col.key)}" value="${esc(value || '#64748b')}" />
      </label>`;
    }
    const type = col.type === 'number' ? 'number' : col.type === 'email' ? 'email' : 'text';
    return `<label class="field">
      <span>${esc(col.label)}${col.required ? ' <span style="color:var(--danger)">*</span>' : ''}</span>
      <input type="${type}" name="${esc(col.key)}" value="${esc(value)}"${req} />
    </label>`;
  }).join('');

  openModal(
    `${isEdit ? 'Edit' : 'Tambah'} ${schema.title}`,
    `<form id="mdForm">
       <div class="form-grid">${fields}</div>
       <p id="mdError" class="form-error" hidden></p>
       <div style="display:flex;gap:9px;justify-content:flex-end;margin-top:18px">
         <button type="button" class="btn btn-ghost" id="mdCancel">Batal</button>
         <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg"></i> ${isEdit ? 'Simpan Perubahan' : 'Tambah'}</button>
       </div>
     </form>`,
    (modalBody) => {
      modalBody.querySelector('#mdCancel').addEventListener('click', closeModal);
      modalBody.querySelector('#mdForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errBox = modalBody.querySelector('#mdError');
        const payload = Object.fromEntries(new FormData(e.target).entries());

        for (const col of schema.columns) {
          if (col.type === 'bool') payload[col.key] = Number(payload[col.key]) ? 1 : 0;
          if (col.type === 'master' && payload[col.key] === '') payload[col.key] = null;
          if (col.type === 'number' && payload[col.key] === '') payload[col.key] = null;
        }

        try {
          if (isEdit) await api.masterUpdate(resource, row.id, payload);
          else await api.masterCreate(resource, payload);
          toast('Data berhasil disimpan', 'ok');
          closeModal();
          masterCache.clear();
          renderMaster(document.getElementById('content'), resource);
        } catch (err) {
          errBox.textContent = err.message;
          errBox.hidden = false;
        }
      });
    }
  );
}
