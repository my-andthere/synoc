/**
 * SYNOC — new ticket form.
 *
 * Sections mirror the NOC reporting sheet:
 *   1. Informasi Umum      — title, priority, channel, description
 *   2. Access              — CID, Link Name, ISP Name
 *   3. Access / Network    — POP, MS / Splitter
 *   4. Parameter Teknis    — MAC, serial, VLAN, signal, lat/long
 */
import { api } from '../lib/api.js';
import { esc, options, toast } from '../lib/ui.js';

let lookups = null;

async function loadLookups() {
  const [svc, pri, ch, cust, isp, pop, ms, link, users] = await Promise.all([
    api.masterOptions('service_type'),
    api.masterOptions('priority'),
    api.masterOptions('channel'),
    api.masterOptions('customer'),
    api.masterOptions('isp'),
    api.masterOptions('pop'),
    api.masterOptions('ms_splitter'),
    api.masterOptions('link'),
    api.users(true),
  ]);
  lookups = {
    service_types: svc.data,
    priorities: pri.data,
    channels: ch.data,
    customers: cust.data,
    isps: isp.data,
    pops: pop.data,
    ms_splitters: ms.data,
    links: link.data,
    users: users.data,
  };
}

export async function renderTicketForm(container) {
  container.innerHTML = `<div class="skeleton" style="height:520px"></div>`;
  await loadLookups();

  container.innerHTML = `
    <form id="ticketForm" class="card" novalidate>
      <!-- ============ INFORMASI UMUM ============ -->
      <section class="form-section">
        <h3>Informasi Umum</h3>
        <div class="form-grid">
          <label class="field span-2">
            <span>Ticket Title <span style="color:var(--danger)">*</span></span>
            <input type="text" name="title" id="fTitle" required
                   placeholder="Contoh: LOS di Backbone BDG–JKT" />
          </label>

          <label class="field">
            <span>Jenis Layanan <span style="color:var(--danger)">*</span></span>
            <select name="service_type_id" id="fServiceType" required>
              ${options(lookups.service_types, { placeholder: '-- Pilih Jenis Layanan --' })}
            </select>
          </label>

          <label class="field">
            <span>Priority <span style="color:var(--danger)">*</span></span>
            <select name="priority_id" id="fPriority" required>
              ${options(lookups.priorities, { placeholder: '-- Select Priority --' })}
            </select>
          </label>

          <label class="field">
            <span>Kanal Pelaporan</span>
            <select name="channel_id" id="fChannel">
              ${options(lookups.channels, { placeholder: '-- Pilih Kanal --' })}
            </select>
          </label>

          <label class="field">
            <span>Customer</span>
            <select name="customer_id" id="fCustomer">
              ${options(lookups.customers, { placeholder: '-- Pilih Customer --' })}
            </select>
          </label>

          <label class="field span-2">
            <span>Problem Description</span>
            <textarea name="description" id="fDescription"
              placeholder="Jelaskan kronologi, gejala, dan dampak layanan…"></textarea>
          </label>
        </div>

        <div id="slaPreview" class="card"
             style="margin-top:14px;padding:13px 15px;background:rgba(34,211,238,0.07);border-color:rgba(34,211,238,0.25)">
          <div class="muted" style="font-size:0.82rem">
            Pilih <strong>Jenis Layanan</strong> dan <strong>Priority</strong> untuk melihat SLA yang berlaku.
          </div>
        </div>
      </section>

      <!-- ============ ACCESS ============ -->
      <section class="form-section">
        <h3>Access</h3>
        <div class="form-grid">
          <label class="field">
            <span>CID</span>
            <input type="text" name="cid" id="fCid" placeholder="CID-JKT-BDG-001" />
          </label>

          <label class="field">
            <span>Link Name</span>
            <select name="link_id" id="fLink">
              ${options(lookups.links, { placeholder: '-- Pilih Link --' })}
            </select>
          </label>

          <label class="field">
            <span>ISP Name</span>
            <select name="isp_id" id="fIsp">
              ${options(lookups.isps, { placeholder: '-- Pilih ISP --' })
                .replace('<option value="', '<option value="')}
            </select>
          </label>

          <label class="field">
            <span>Link Name (manual)</span>
            <input type="text" name="link_name" id="fLinkName" placeholder="Diisi otomatis dari Link" />
          </label>
        </div>
      </section>

      <!-- ============ ACCESS / NETWORK ============ -->
      <section class="form-section">
        <h3>Access / Network</h3>
        <div class="form-grid">
          <label class="field">
            <span>POP (Point of Presence)</span>
            <select name="pop_id" id="fPop">
              ${options(lookups.pops, { placeholder: '-- Pilih POP --' })}
            </select>
          </label>

          <label class="field">
            <span>MS / Splitter</span>
            <select name="ms_splitter_id" id="fMs">
              ${options(lookups.ms_splitters, { placeholder: '-- Pilih MS / Splitter --' })}
            </select>
          </label>
        </div>
      </section>

      <!-- ============ PARAMETER TEKNIS ============ -->
      <section class="form-section">
        <h3>Parameter Teknis</h3>
        <div class="form-grid">
          <label class="field">
            <span>MAC Address</span>
            <input type="text" name="mac_address" id="fMac" placeholder="48:1F:3B:AA:00:01" />
          </label>

          <label class="field">
            <span>Serial Number</span>
            <input type="text" name="serial_number" id="fSerial" placeholder="HW-8245-0001" />
          </label>

          <label class="field">
            <span>VLAN ID</span>
            <input type="text" name="vlan_id" id="fVlan" placeholder="120" />
          </label>

          <label class="field">
            <span>Signal Input CPE (dBm)</span>
            <input type="number" step="0.1" name="signal_input_cpe_dbm" id="fSignal" placeholder="-21.5" />
          </label>

          <label class="field">
            <span>Latitude</span>
            <input type="number" step="0.0000001" name="latitude" id="fLat" placeholder="-6.2088" />
          </label>

          <label class="field">
            <span>Longitude</span>
            <input type="number" step="0.0000001" name="longitude" id="fLng" placeholder="106.8456" />
          </label>
        </div>
      </section>

      <!-- ============ PELAPOR & PENANGGUNG JAWAB ============ -->
      <section class="form-section">
        <h3>Pelapor &amp; Penanggung Jawab</h3>
        <div class="form-grid">
          <label class="field">
            <span>Reported By</span>
            <input type="text" name="reported_by" id="fReportedBy" placeholder="Nama pelapor" />
          </label>

          <label class="field">
            <span>Reporter Contact</span>
            <input type="text" name="reporter_contact" id="fReporterContact" placeholder="No. HP / email" />
          </label>

          <label class="field">
            <span>Assigned To</span>
            <select name="assigned_to" id="fAssignee">
              ${options(lookups.users.map((u) => ({ id: u.id, label: `${u.full_name} (${u.role})` })),
                     { placeholder: '-- Pilih Petugas --' })}
            </select>
          </label>

          <label class="field">
            <span>Team</span>
            <input type="text" name="team" id="fTeam" placeholder="NOC / Field / Core" />
          </label>
        </div>
      </section>

      <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
        <button type="reset" class="btn btn-ghost" id="fReset">Bersihkan</button>
        <button type="submit" class="btn btn-primary" id="fSubmit">Buat Tiket</button>
      </div>
    </form>
  `;

  wireForm(container);
}

function wireForm(container) {
  const form = document.getElementById('ticketForm');

  // --- Live SLA preview ---
  const slaBox = document.getElementById('slaPreview');
  const svcSel = document.getElementById('fServiceType');
  const priSel = document.getElementById('fPriority');

  async function refreshSla() {
    if (!svcSel.value || !priSel.value) {
      slaBox.innerHTML = `<div class="muted" style="font-size:0.82rem">
        Pilih <strong>Jenis Layanan</strong> dan <strong>Priority</strong> untuk melihat SLA yang berlaku.</div>`;
      return;
    }
    try {
      const { data } = await api.slaPreview(svcSel.value, priSel.value);
      slaBox.innerHTML = `
        <div style="display:flex;gap:22px;flex-wrap:wrap;align-items:center">
          <div>
            <div class="stat-label">Response</div>
            <div style="font-size:1.15rem;font-weight:700">${esc(String(data.response_hours))} jam</div>
          </div>
          <div>
            <div class="stat-label">Resolusi</div>
            <div style="font-size:1.15rem;font-weight:700">${esc(String(data.resolution_hours))} jam</div>
          </div>
          <div>
            <div class="stat-label">Eskalasi</div>
            <div style="font-size:1.15rem;font-weight:700">${esc(String(data.escalation_hours ?? '—'))} jam</div>
          </div>
          <div style="margin-left:auto;text-align:right">
            <span class="badge b-ok">SLA aktif</span>
            <p class="muted" style="font-size:0.76rem;margin-top:5px">${esc(data.service_type_name)} · ${esc(data.priority_name)}</p>
          </div>
        </div>`;
    } catch {
      slaBox.innerHTML = `<div class="muted" style="font-size:0.82rem">Tidak ada kebijakan SLA untuk kombinasi ini.</div>`;
    }
  }
  svcSel.addEventListener('change', refreshSla);
  priSel.addEventListener('change', refreshSla);

  // --- Link selection auto-fills ISP + link name ---
  const linkSel = document.getElementById('fLink');
  const ispSel = document.getElementById('fIsp');
  const linkNameInput = document.getElementById('fLinkName');
  const cidInput = document.getElementById('fCid');

  linkSel.addEventListener('change', () => {
    const link = lookups.links.find((l) => String(l.id) === linkSel.value);
    if (!link) return;
    linkNameInput.value = link.label || '';
    if (link.isp_id && link.isp_id !== undefined) {
      const opt = Array.from(ispSel.options).find((o) => o.value === String(link.isp_id));
      if (opt) ispSel.value = String(link.isp_id);
    }
    if (link.cid && !cidInput.value) cidInput.value = link.cid;
  });

  // --- Submit ---
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('fSubmit');
    const payload = Object.fromEntries(new FormData(form).entries());

    for (const k of Object.keys(payload)) {
      if (payload[k] === '') payload[k] = null;
    }
    payload.title = String(payload.title || '').trim();
    if (!payload.title) {
      toast('Ticket Title wajib diisi', 'err');
      document.getElementById('fTitle').focus();
      return;
    }
    if (!payload.service_type_id) { toast('Jenis Layanan wajib dipilih', 'err'); return; }
    if (!payload.priority_id) { toast('Priority wajib dipilih', 'err'); return; }

    btn.disabled = true;
    btn.textContent = 'Menyimpan…';
    try {
      const { data } = await api.createTicket(payload);
      toast(`Tiket ${data.ticket_number} berhasil dibuat`, 'ok');
      form.reset();
      window.dispatchEvent(new CustomEvent('synoc:navigate', { detail: { view: 'ticket', id: data.id } }));
    } catch (err) {
      toast(err.message || 'Gagal membuat tiket', 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Buat Tiket';
    }
  });

  document.getElementById('fReset').addEventListener('click', () => {
    setTimeout(refreshSla, 0);
  });
}
