/**
 * SYNOC — tickets list view (filters, search, table).
 */
import { api } from '../lib/api.js';
import {
  esc, relative, fmtDate, statusBadge, priorityPill, slaMeter, emptyState, options, debounce,
} from '../lib/ui.js';

const STATUSES = ['open', 'in_progress', 'pending_customer', 'escalated', 'resolved', 'closed', 'cancelled'];

const state = {
  status: '',
  priority_id: '',
  service_type_id: '',
  channel_id: '',
  search: '',
  overdue: '',
};

let lookups = { priorities: [], service_types: [], channels: [], users: [] };

export async function renderTickets(container) {
  container.innerHTML = `<div class="skeleton" style="height:340px"></div>`;

  const [opts, users] = await Promise.all([
    Promise.all([
      api.masterOptions('priority'),
      api.masterOptions('service_type'),
      api.masterOptions('channel'),
    ]),
    api.users(true),
  ]);
  lookups = {
    priorities: opts[0].data,
    service_types: opts[1].data,
    channels: opts[2].data,
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
  document.getElementById('fOverdue').addEventListener('change', (e) => {
    state.overdue = e.target.value; loadTable();
  });
  document.getElementById('fReset').addEventListener('click', () => {
    Object.assign(state, { status: '', priority_id: '', service_type_id: '', channel_id: '', search: '', overdue: '' });
    renderTickets(container);
  });

  document.getElementById('statusChips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-status]');
    if (!btn) return;
    state.status = btn.dataset.status;
    document.querySelectorAll('#statusChips .chip').forEach((c) => c.classList.toggle('active', c === btn));
    loadTable();
  });

  await loadTable();
}

function statusLabel(s) {
  return {
    open: 'Open', in_progress: 'In Progress', pending_customer: 'Pending Customer',
    escalated: 'Escalated', resolved: 'Resolved', closed: 'Closed', cancelled: 'Cancelled',
  }[s] || s;
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
    search: state.search,
    overdue: state.overdue,
    limit: 100,
  };

  const { data, count } = await api.tickets(params);

  if (!data.length) {
    target.innerHTML = emptyState('🔍', 'Tidak ada tiket yang cocok dengan filter');
    return;
  }

  target.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nomor Tiket</th>
            <th>Judul</th>
            <th>Jenis</th>
            <th>CID</th>
            <th>Prioritas</th>
            <th>Kanal</th>
            <th>Status</th>
            <th>SLA</th>
            <th>Dibuat</th>
          </tr>
        </thead>
        <tbody>
          ${data.map((r) => `
            <tr>
              <td><a href="#" data-ticket="${esc(r.id)}" class="mono" style="font-size:0.78rem;font-weight:600">${esc(r.ticket_number)}</a></td>
              <td>
                <div class="tbl-title">${esc(r.title)}</div>
                <div class="tbl-sub">${esc(r.service_type_name)}${r.pop_name ? ' · ' + esc(r.pop_name) : ''}${r.assignee_name ? ' · ' + esc(r.assignee_name) : ''}</div>
              </td>
              <td><span class="badge b-neutral">${esc(r.service_type_name)}</span></td>
              <td class="mono" style="font-size:0.78rem">${esc(r.cid || '—')}</td>
              <td>${priorityPill(r.priority_name, r.priority_color)}</td>
              <td style="font-size:0.8rem">${esc(r.channel_name || '—')}</td>
              <td>${statusBadge(r.status)}${r.sla_overdue ? ' <span class="badge b-breach">!</span>' : ''}</td>
              <td>${slaMeter(r)}</td>
              <td class="nowrap" style="font-size:0.78rem;color:var(--muted)">${esc(relative(r.created_at))}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="muted" style="margin-top:10px">${esc(String(count))} tiket ditampilkan</p>
  `;
}
