/**
 * SYNOC — ticket detail (modal view): full fields, SLA panel, timeline, actions.
 */
import { api } from '../lib/api.js';
import {
  esc, relative, fmtDate, fmtDuration, statusBadge, priorityPill, options, toast, openModal,
} from '../lib/ui.js';

const STATUSES = ['open', 'in_progress', 'pending_customer', 'escalated', 'resolved', 'closed', 'cancelled'];

export async function showTicket(id) {
  openModal('Memuat…', '<div class="skeleton" style="height:300px"></div>');

  const { data: t, events, sla } = await api.ticket(id);
  const users = (await api.users(true)).data;

  const overdue = t.sla_overdue;
  const closed = ['resolved', 'closed', 'cancelled'].includes(t.status);

  const body = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
      <span class="badge b-neutral mono">${esc(t.ticket_number)}</span>
      ${statusBadge(t.status)}
      ${priorityPill(t.priority_name, t.priority_color)}
      <span class="badge b-neutral">${esc(t.service_type_name)}</span>
      ${overdue ? '<span class="badge b-breach">⚠ SLA Terlanggar</span>' : ''}
      ${!overdue && !closed ? '<span class="badge b-ok">Dalam SLA</span>' : ''}
    </div>

    <h3 style="font-size:1.08rem;margin-bottom:14px">${esc(t.title)}</h3>

    <!-- SLA panel -->
    <div class="card" style="margin-bottom:18px;padding:14px 16px;${overdue
      ? 'background:rgba(239,68,68,0.07);border-color:rgba(239,68,68,0.3)'
      : 'background:rgba(34,211,238,0.06);border-color:rgba(34,211,238,0.22)'}">
      <div style="display:flex;gap:26px;flex-wrap:wrap">
        <div>
          <div class="stat-label">Response Due</div>
          <div style="font-weight:600;font-size:0.9rem">${esc(fmtDate(sla?.response_due_at))}</div>
          <small class="muted">${sla?.first_response_at
            ? 'Merespons ' + esc(relative(sla.first_response_at))
            : 'Belum ada respons'}</small>
        </div>
        <div>
          <div class="stat-label">Resolution Due</div>
          <div style="font-weight:600;font-size:0.9rem">${esc(fmtDate(sla?.resolution_due_at))}</div>
          <small class="muted">${sla?.resolved_at
            ? 'Terselesaikan ' + esc(relative(sla.resolved_at))
            : 'Sisa ' + esc(fmtDuration(Math.round((new Date(sla?.resolution_due_at) - Date.now()) / 60000)))}</small>
        </div>
        <div>
          <div class="stat-label">Target Resolusi</div>
          <div style="font-weight:600;font-size:0.9rem">${esc(String(t.sla_resolution_hours))} jam</div>
          <small class="muted">Priority ${esc(t.priority_name)}</small>
        </div>
        ${sla?.paused_minutes ? `
          <div>
            <div class="stat-label">Jeda</div>
            <div style="font-weight:600;font-size:0.9rem">${esc(String(sla.paused_minutes))} mnt</div>
            <small class="muted">Menunggu customer</small>
          </div>` : ''}
      </div>
    </div>

    <!-- Access / Network -->
    <div class="form-section">
      <h3>Access &amp; Network</h3>
      <dl class="detail-grid">
        ${cell('CID', t.cid)}
        ${cell('Link Name', t.link_name)}
        ${cell('ISP Name', t.isp_name)}
        ${cell('POP', t.pop_name)}
        ${cell('MS / Splitter', t.ms_splitter_name)}
        ${cell('Customer', t.customer_name_master || t.customer_name)}
      </dl>
    </div>

    <!-- Parameter Teknis -->
    <div class="form-section">
      <h3>Parameter Teknis</h3>
      <dl class="detail-grid">
        ${cell('MAC Address', t.mac_address, true)}
        ${cell('Serial Number', t.serial_number, true)}
        ${cell('VLAN ID', t.vlan_id)}
        ${cell('Signal Input CPE', t.signal_input_cpe_dbm !== null ? `${t.signal_input_cpe_dbm} dBm` : null)}
        ${cell('Latitude', t.latitude)}
        ${cell('Longitude', t.longitude)}
      </dl>
    </div>

    <!-- Informasi Umum -->
    <div class="form-section">
      <h3>Informasi Umum</h3>
      <dl class="detail-grid">
        ${cell('Ticket Title', t.title)}
        ${cell('Priority', `${t.priority_name} (${t.sla_resolution_hours}h)`)}
        ${cell('Kanal Pelaporan', t.channel_name)}
        ${cell('Reported By', t.reported_by)}
        ${cell('Reporter Contact', t.reporter_contact)}
        ${cell('Assigned To', t.assignee_name)}
        ${cell('Team', t.team)}
        ${cell('Dibuat', fmtDate(t.created_at))}
      </dl>
      ${t.description ? `
        <div style="margin-top:14px">
          <div class="stat-label" style="margin-bottom:5px">Problem Description</div>
          <p style="font-size:0.88rem;white-space:pre-wrap;color:var(--muted)">${esc(t.description)}</p>
        </div>` : ''}
      ${t.resolution_note ? `
        <div style="margin-top:14px">
          <div class="stat-label" style="margin-bottom:5px">Resolution Note</div>
          <p style="font-size:0.88rem;white-space:pre-wrap;color:var(--muted)">${esc(t.resolution_note)}</p>
        </div>` : ''}
    </div>

    <!-- Aksi -->
    <div class="form-section">
      <h3>Aksi</h3>
      <div class="form-grid">
        <label class="field">
          <span>Ubah Status</span>
          <select id="aStatus">
            ${options(STATUSES.map((s) => ({ id: s, label: s })), { selected: t.status })}
          </select>
        </label>
        <label class="field">
          <span>Assign To</span>
          <select id="aAssignee">
            ${options(users.map((u) => ({ id: u.id, label: u.full_name })), { selected: t.assigned_to, placeholder: '-- Tidak ada --' })}
          </select>
        </label>
        <label class="field span-2">
          <span>Catatan</span>
          <input type="text" id="aNote" placeholder="Catatan untuk timeline…" />
        </label>
      </div>
      <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:6px">
        <button class="btn btn-primary btn-sm" id="aApplyStatus">Simpan Status</button>
        <button class="btn btn-ghost btn-sm" id="aApplyAssign">Simpan Assignee</button>
        <button class="btn btn-ghost btn-sm" id="aAddNote">Tambah Catatan</button>
      </div>
    </div>

    <!-- Timeline -->
    <div class="form-section">
      <h3>Timeline</h3>
      <div class="timeline">
        ${events.length ? events.map(eventItem).join('') : '<p class="muted">Belum ada aktivitas.</p>'}
      </div>
    </div>
  `;

  openModal(t.ticket_number, body, (modalBody) => {
    modalBody.querySelector('#aApplyStatus').addEventListener('click', async () => {
      try {
        await api.setStatus(id, modalBody.querySelector('#aStatus').value,
                           modalBody.querySelector('#aNote').value || null);
        toast('Status diperbarui', 'ok');
        await showTicket(id);
        window.dispatchEvent(new CustomEvent('synoc:refresh'));
      } catch (err) { toast(err.message, 'err'); }
    });

    modalBody.querySelector('#aApplyAssign').addEventListener('click', async () => {
      try {
        const v = modalBody.querySelector('#aAssignee').value;
        await api.assign(id, v ? Number(v) : null);
        toast('Assignee diperbarui', 'ok');
        await showTicket(id);
      } catch (err) { toast(err.message, 'err'); }
    });

    modalBody.querySelector('#aAddNote').addEventListener('click', async () => {
      const note = modalBody.querySelector('#aNote').value.trim();
      if (!note) { toast('Catatan kosong', 'err'); return; }
      try {
        await api.addEvent(id, note, 'note');
        toast('Catatan ditambahkan', 'ok');
        await showTicket(id);
      } catch (err) { toast(err.message, 'err'); }
    });
  });
}

function cell(label, value, mono = false) {
  return `<div class="detail-cell">
    <dt>${esc(label)}</dt>
    <dd class="${mono ? 'mono' : ''}" style="font-size:0.85rem">${value ? esc(value) : '—'}</dd>
  </div>`;
}

function eventItem(e) {
  const label = {
    created: 'Tiket dibuat',
    status_change: 'Status diubah',
    assigned: 'Ditugaskan',
    priority_change: 'Priority diubah',
    note: 'Catatan',
    comment: 'Komentar',
    sla_breach: 'Pelanggaran SLA',
    attachment: 'Lampiran',
    field_update: 'Field diperbarui',
  }[e.event_type] || e.event_type;

  const detail = e.from_value && e.to_value
    ? `${esc(e.from_value)} → ${esc(e.to_value)}`
    : (e.to_value || '');

  return `<div class="tl-item ${e.event_type === 'sla_breach' ? 'breach' : ''}">
    <div class="tl-head">
      <strong>${esc(label)}</strong>
      ${detail ? `<span class="muted">${detail}</span>` : ''}
      <time>${esc(fmtDate(e.created_at))} · ${esc(e.user_name || 'system')}</time>
    </div>
    ${e.note ? `<div class="tl-body">${esc(e.note)}</div>` : ''}
  </div>`;
}
