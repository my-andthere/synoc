/**
 * SYNOC — tickets list view (filters, search, table).
 */
import { api, session } from '../lib/api.js';
import {
  esc, relative, fmtDate, statusBadge, priorityPill, slaMeter, emptyState, options, debounce,
} from '../lib/ui.js';
import { showTicketEdit } from './ticket-edit.js';

const STATUSES = ['open', 'in_progress', 'pending_customer', 'escalated', 'resolved', 'closed', 'cancelled'];

const state = {
  status: '',
  priority_id: '',
  service_type_id: '',
  channel_id: '',
  pic_id: '',
  search: '',
  overdue: '',
};

let lookups = { priorities: [], service_types: [], channels: [], pics: [], users: [] };

export async function renderTickets(container) {
  container.innerHTML = `<div class="skeleton" style="height:340px"></div>`;

  const [opts, users] = await Promise.all([
    Promise.all([
      api.masterOptions('priority'),
      api.masterOptions('service_type'),
      api.masterOptions('channel'),
      api.masterOptions('pic'),
    ]),
    api.users(true),
  ]);
  lookups = {
    priorities: opts[0].data,
    service_types: opts[1].data,
    channels: opts[2].data,
    pics: opts[3].data,
    users: users.data,
  };

  container.innerHTML = `
    <div class="chips" id="statusChips">
      <button class="chip active" data-status="">Semua</button>
      ${STATUSES.map((s) => `<button class="chip" data-status="${s}">${statusLabel(s)}</button>`).join('')}
    </div>

    <div class="toolbar">
      <label class="field search">
        <span>Cari</span>
        <input type="search" id="fSearch" placeholder="Nomor tiket, judul, CID, link…" value="${esc(state.search)}" />
      </label>
      <label class="field">
        <span>Jenis Layanan</span>
        <select id="fService">
          ${options(lookups.service_types, { placeholder: 'Semua', selected: state.service_type_id })}
        </select>
      </label>
      <label class="field">
        <span>Prioritas</span>
        <select id="fPriority">
          ${options(lookups.priorities, { placeholder: 'Semua', selected: state.priority_id })}
        </select>
      </label>
      <label class="field">
        <span>Kanal</span>
        <select id="fChannel">
          ${options(lookups.channels, { placeholder: 'Semua', selected: state.channel_id })}
        </select>
      </label>
      <label class="field">
        <span>PIC</span>
        <select id="fPic">
          ${options(lookups.pics.map((p) => ({
            id: p.id,
            label: p.position ? `${p.name} — ${p.position}` : p.name,
          })), { placeholder: 'Semua', selected: state.pic_id })}
        </select>
      </label>
      <label class="field">
        <span>Status SLA</span>
        <select id="fOverdue">
          ${options([
            { id: '', label: 'Semua' },
            { id: '1', label: 'Terlanggar saja' },
          ], { selected: state.overdue, placeholder: null })}
        </select>
      </label>
      <button class="btn btn-ghost btn-sm" id="fReset">Reset</button>
    </div>

    <div id="ticketTable"></div>
  `;

  const apply = debounce(() => loadTable(), 250);

  document.getElementById('fSearch').addEventListener('input', (e) => {
    state.search = e.target.value;
    apply();
  });
  document.getElementById('fService').addEventListener('change', (e) => {
    state.service_type_id = e.target.value; loadTable();
  });
  document.getElementById('fPriority').addEventListener('change', (e) => {
    state.priority_id = e.target.value; loadTable();
  });
  document.getElementById('fChannel').addEventListener('change', (e) => {
    state.channel_id = e.target.value; loadTable();
  });
  document.getElementById('fPic').addEventListener('change', (e) => {
    state.pic_id = e.target.value; loadTable();
  });
  document.getElementById('fOverdue').addEventListener('change', (e) => {
    state.overdue = e.target.value; loadTable();
  });
  document.getElementById('fReset').addEventListener('click', () => {
    Object.assign(state, { status: '', priority_id: '', service_type_id: '', channel_id: '', pic_id: '', search: '', overdue: '' });
    renderTickets(container);
  });

  document.getElementById('statusChips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-status]');
    if (!btn) return;
    state.status = btn.dataset.status;
    document.querySelectorAll('#statusChips .chip').forEach((c) => c.classList.toggle('active', c === btn));
    loadTable();
  });

  // Tombol "Edit" (khusus admin) membuka popup edit tiket.
  // Delegasi pada #ticketTable supaya tetap berlaku setelah tabel di-render ulang.
  document.getElementById('ticketTable').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ticket-edit]');
    if (!btn) return;
    e.preventDefault();
    showTicketEdit(btn.dataset.ticketEdit, () => loadTable());
  });

  await loadTable();
}

function statusLabel(s) {
  return {
    open: 'Open', in_progress: 'In Progress', pending_customer: 'Pending Customer',
    escalated: 'Escalated', resolved: 'Resolved', closed: 'Closed', cancelled: 'Cancelled',
  }[s] || s;
}

/**
 * Cell PIC pada tabel utama.
 * Menampilkan nama PIC dari master data; bila kosong, tampilkan handler
 * (akun NOC yang ditugaskan) sebagai fallback.
 */
function picCell(r) {
  if (r.pic_name) {
    const regional = String(r.regional || '').toUpperCase();
    const badge = regional
      ? `<span class="badge b-neutral mono" style="font-size:0.66rem;margin-left:5px">${esc(regional)}</span>`
      : '';
    return `<span title="${esc(r.pic_name)}">${esc(r.pic_name)}</span>${badge}`;
  }
  if (r.assignee_name) {
    return `<span class="dim" title="Handler: ${esc(r.assignee_name)}">${esc(r.assignee_name)}</span>`;
  }
  return '<span class="dim">—</span>';
}

async function loadTable() {
  const target = document.getElementById('ticketTable');
  if (!target) return;
  target.innerHTML = `<div class="skeleton" style="height:260px"></div>`;

  const params = {
    status: state.status,
    priority_id: state.priority_id,
    service_type_id: state.service_type_id,
    channel_id: state.channel_id,
    pic_id: state.pic_id,
    search: state.search,
    overdue: state.overdue,
    limit: 100,
  };

  const { data, count } = await api.tickets(params);

  if (!data.length) {
    target.innerHTML = emptyState('bi-search', 'Tidak ada tiket yang cocok dengan filter');
    return;
  }

  // Tombol "Edit" hanya ditampilkan untuk admin.
  const isAdmin = String(session.user?.role || '').toLowerCase() === 'admin';

  target.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="col-actions">Aksi</th>
            <th>Nomor Tiket</th>
            <th>Judul</th>
            <th>Jenis</th>
            <th>Prioritas</th>
            <th>Kanal</th>
            <th>PIC</th>
            <th>Status</th>
            <th>SLA</th>
            <th>Dibuat</th>
          </tr>
        </thead>
        <tbody>
          ${data.map((r) => {
            const isAccess = String(r.service_type_code || '').toUpperCase() === 'ACCESS';
            return `
            <tr>
              <td class="col-actions">
                <div class="act-cell">
                  <button type="button" class="btn btn-ghost btn-xs" data-ticket="${esc(r.id)}"
                          title="Buka detail &amp; update tiket"><i class="bi bi-arrow-repeat"></i> Update</button>
                  ${isAdmin ? `<button type="button" class="btn btn-ghost btn-xs" data-ticket-edit="${esc(r.id)}"
                          title="Edit data tiket"><i class="bi bi-pencil-square"></i> Edit</button>` : ''}
                </div>
              </td>
              <td><a href="#" data-ticket="${esc(r.id)}" class="mono" style="font-size:0.78rem;font-weight:600">${esc(r.ticket_number)}</a></td>
              <td>
                <div class="tbl-title">${esc(r.title)}</div>
                <div class="tbl-sub">${esc(r.service_type_name)}${isAccess && r.pop_name ? ' · ' + esc(r.pop_name) : ''}${r.pic_name ? '' : (r.assignee_name ? ' · ' + esc(r.assignee_name) : '')}</div>
              </td>
              <td><span class="badge b-neutral">${esc(r.service_type_name)}</span></td>
              <td>${priorityPill(r.priority_name, r.priority_color)}</td>
              <td style="font-size:0.8rem">${esc(r.channel_name || '—')}</td>
              <td class="col-pic" style="font-size:0.8rem">${picCell(r)}</td>
              <td>${statusBadge(r.status)}${r.sla_overdue ? ' <span class="badge b-breach">!</span>' : ''}</td>
              <td>${slaMeter(r)}</td>
              <td class="nowrap" style="font-size:0.78rem;color:var(--muted)">${esc(relative(r.created_at))}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <p class="muted" style="margin-top:10px">${esc(String(count))} tiket ditampilkan</p>
  `;
}
