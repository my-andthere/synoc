/**
 * SYNOC — SLA & priority view.
 */
import { api } from '../lib/api.js';
import { esc, priorityPill, emptyState } from '../lib/ui.js';

export async function renderSla(container) {
  container.innerHTML = `<div class="skeleton" style="height:420px"></div>`;

  const [{ data: policies }, { data: priorities }] = await Promise.all([
    api.slaPolicies(),
    api.masterOptions('priority'),
  ]);

  const svcTypes = (await api.masterOptions('service_type')).data;
  const svcName = Object.fromEntries(svcTypes.map((s) => [String(s.id), s.label]));

  container.innerHTML = `
    <div class="card" style="margin-bottom:18px">
      <div class="card-head">
        <h3>Definisi Priority &amp; SLA Standar</h3>
        <span class="muted">Target waktu penyelesaian dari OPEN sampai RESOLVED</span>
      </div>
      <div class="grid grid-4">
        ${priorities.map((p) => `
          <div class="stat" style="--accent:${esc(p.color)}">
            <div class="stat-label">${esc(p.label)}</div>
            <div class="stat-value" style="font-size:1.5rem;color:${esc(p.color)}">${esc(String(p.resolution_hours))}h</div>
            <div class="stat-sub">resolusi · respons ${esc(String(p.response_hours))}h</div>
          </div>`).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>Kebijakan SLA per Jenis Layanan</h3>
        <span class="muted">${esc(String(policies.length))} kebijakan aktif</span>
      </div>
      ${policies.length ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kebijakan</th>
                <th>Jenis Layanan</th>
                <th>Priority</th>
                <th>Response</th>
                <th>Resolusi</th>
                <th>Eskalasi</th>
                <th>Jeda</th>
                <th>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              ${policies.map((p) => `
                <tr>
                  <td class="tbl-title">${esc(p.name)}</td>
                  <td><span class="badge b-neutral">${esc(p.service_type_name)}</span></td>
                  <td>${priorityPill(p.priority_name, p.priority_color)}</td>
                  <td class="mono">${esc(String(p.response_hours))} jam</td>
                  <td class="mono" style="font-weight:600">${esc(String(p.resolution_hours))} jam</td>
                  <td class="mono muted">${esc(String(p.escalation_hours ?? '—'))} jam</td>
                  <td>${p.pause_on_customer_wait ? '<span class="badge b-ok">Ya</span>' : '<span class="badge b-neutral">Tidak</span>'}</td>
                  <td class="muted" style="font-size:0.78rem">${esc(p.description || '—')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : emptyState('⏱', 'Belum ada kebijakan SLA')}
    </div>
  `;
}
