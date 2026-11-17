/**
 * SYNOC — dashboard view.
 */
import { api } from '../lib/api.js';
import { esc, relative, fmtDate, statusBadge, priorityPill, slaMeter, emptyState } from '../lib/ui.js';

export async function renderDashboard(container) {
  container.innerHTML = `<div class="grid grid-4">
    ${'<div class="skeleton" style="height:90px"></div>'.repeat(4)}
  </div>`;

  const { data } = await api.dashboard();
  const t = data.totals || {};
  const sla = data.sla || {};

  const statCards = [
    { label: 'Total Tiket', value: t.total || 0, sub: `${t.created_today || 0} dibuat hari ini`, accent: 'var(--brand)' },
    { label: 'Open', value: t.open_count || 0, sub: `${t.in_progress_count || 0} sedang ditangani`, accent: 'var(--info)' },
    { label: 'SLA Terlanggar', value: sla.breached || 0, sub: `${sla.within_sla || 0} masih dalam SLA`, accent: 'var(--danger)' },
    { label: 'Kepatuhan SLA', value: `${sla.compliance_percent ?? 100}%`, sub: `${sla.met || 0} tiket tercapai`, accent: 'var(--ok)' },
  ];

  const statusCounts = Object.fromEntries((data.by_status || []).map((r) => [r.status, r.count]));

  const html = `
    <div class="grid grid-4">
      ${statCards.map((c) => `
        <div class="stat" style="--accent:${c.accent}">
          <div class="stat-label">${esc(c.label)}</div>
          <div class="stat-value">${esc(String(c.value))}</div>
          <div class="stat-sub">${esc(c.sub)}</div>
        </div>`).join('')}
    </div>

    <div class="grid grid-3" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><h3>Status Tiket</h3></div>
        <div class="legend" style="flex-direction:column;gap:9px;align-items:stretch">
          ${['open', 'in_progress', 'pending_customer', 'escalated', 'resolved', 'closed']
            .map((s) => `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
                ${statusBadge(s)}
                <strong>${esc(String(statusCounts[s] || 0))}</strong>
              </div>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>SLA per Prioritas</h3>
          <span class="muted">terlanggar / total</span>
        </div>
        ${(data.sla?.by_priority || []).map((p) => {
          const total = Number(p.total) || 0;
          const breach = Number(p.breached) || 0;
          const pct = total ? Math.round((breach / total) * 100) : 0;
          return `
            <div style="margin-bottom:13px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
                ${priorityPill(p.priority_name, p.color)}
                <span class="muted" style="font-size:0.78rem">${esc(String(breach))} / ${esc(String(total))}</span>
              </div>
              <div class="sla-meter ${breach ? 'sla-breach' : 'sla-ok'}">
                <span style="width:${Math.max(pct, 2)}%"></span>
              </div>
            </div>`;
        }).join('') || emptyState('bi-bar-chart', 'Belum ada data')}
      </div>

      <div class="card">
        <div class="card-head"><h3>Kanal Pelaporan</h3></div>
        ${(data.by_channel || []).map((c) => {
          const total = (data.by_channel || []).reduce((s, x) => s + Number(x.count || 0), 0) || 1;
          const pct = Math.round((Number(c.count || 0) / total) * 100);
          return `
            <div style="margin-bottom:11px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font-size:0.86rem">
                <span><i class="bi ${esc(c.channel_icon || 'bi-inbox')}"></i> ${esc(c.channel_name)}</span>
                <strong>${esc(String(c.count || 0))}</strong>
              </div>
              <div class="sla-meter sla-ok"><span style="width:${Math.max(pct, 2)}%"></span></div>
            </div>`;
        }).join('') || emptyState('bi-envelope', 'Belum ada data')}
      </div>
    </div>

    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><h3>Tiket Terbaru</h3></div>
        ${(data.recent || []).length ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Nomor</th><th>Judul</th><th>Prioritas</th><th>Status</th></tr></thead>
              <tbody>
                ${data.recent.map((r) => `
                  <tr>
                    <td><a href="#" data-ticket="${esc(r.id)}" class="mono" style="font-size:0.78rem">${esc(r.ticket_number)}</a></td>
                    <td class="tbl-title">${esc(r.title)}</td>
                    <td>${priorityPill(r.priority_name, r.priority_color)}</td>
                    <td>${statusBadge(r.status)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : emptyState('bi-ticket-perforated', 'Belum ada tiket')}
      </div>

      <div class="card">
        <div class="card-head">
          <h3>Tren Tiket 14 Hari</h3>
          <span class="muted">total ${esc(String(t.created_7d || 0))} dalam 7 hari</span>
        </div>
        ${trendChart(data.trend || [])}
      </div>
    </div>

    ${(data.top_cid || []).length ? `
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h3>CID dengan Tiket Terbanyak</h3></div>
        <div class="chips">
          ${data.top_cid.map((c) => `<span class="chip">${esc(c.cid)} · ${esc(String(c.count))}</span>`).join('')}
        </div>
      </div>` : ''}
  `;

  container.innerHTML = html;
}

function trendChart(rows) {
  if (!rows.length) return emptyState('bi-graph-up-arrow', 'Belum ada data 14 hari terakhir');
  const max = Math.max(...rows.map((r) => Number(r.count) || 0), 1);
  return `<div class="bars">
    ${rows.map((r) => {
      const pct = Math.max((Number(r.count) / max) * 100, 4);
      const day = new Date(r.day).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
      return `<div class="bar-col">
        <span class="bar-value">${esc(String(r.count))}</span>
        <div class="bar" style="height:${pct}%"></div>
        <span class="bar-label">${esc(day)}</span>
      </div>`;
    }).join('')}
  </div>`;
}
