/**
 * SYNOC — new ticket form.
 *
 * Sections mirror the NOC reporting sheet:
 *   1. Informasi Umum      — title, priority, channel, description
 *   2. Access              — CID, Link Name, ISP Name  (only for "Access")
 *   3. Access / Network    — POP, MS / Splitter        (only for "Access")
 *   4. Pelapor & Penanggung Jawab — reported by (otomatis), PIC, regional
 *
 * Sections 2 and 3 carry the `data-access-only` attribute: they are shown
 * only when the selected service type code is ACCESS.
 *
 * NOTE: field "Customer" DIHAPUS dari form ini (18 Nov 2026). Kolom DB
 * `tickets.customer_id` tetap ada untuk data lama dan masih ditampilkan
 * di popup detail (baca saja).
 */
import { api, session } from '../lib/api.js';
import { esc, options, toast } from '../lib/ui.js';
import {
  createSearchable, setSearchableValue, getSearchableValue, resetSearchable, clearField,
} from '../lib/searchable.js';

/** Regional/wilayah operasional NOC. */
const REGIONALS = ['WEST', 'CENTRAL', 'EAST'];

let lookups = null;

/**
 * Tanggal & jam defaults (waktu lokal browser).
 * Dipakai sebagai nilai awal field "Tanggal Pengajuan" & "Jam Pengajuan".
 */
function currentDateTime() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}`,
  };
}

async function loadLookups() {
  const [svc, pri, ch, isp, pop, ms, link, pic, branch] = await Promise.all([
    api.masterOptions('service_type'),
    api.masterOptions('priority'),
    api.masterOptions('channel'),
    api.masterOptions('isp'),
    api.masterOptions('pop'),
    api.masterOptions('ms_splitter'),
    api.masterOptions('link'),
    api.masterOptions('pic'),
    api.masterOptions('branch'),
  ]);
  lookups = {
    service_types: svc.data,
    priorities: pri.data,
    channels: ch.data,
    isps: isp.data,
    pops: pop.data,
    ms_splitters: ms.data,
    links: link.data,
    // Cabang: label memuat kota agarTechnisi tidak keliru memilih.
    branches: branch.data,
    // Label PIC: nama + jabatan supaya teknisi tidak keliru memilih.
    pics: pic.data.map((p) => ({
      id: p.id,
      label: p.position ? `${p.name} — ${p.position}` : p.name,
    })),
  };
}

export async function renderTicketForm(container) {
  container.innerHTML = `<div class="skeleton" style="height:520px"></div>`;
  await loadLookups();

  // "Reported By" diisi otomatis dari nama akun yang sedang login.
  const reporterName = session.user?.full_name || session.user?.username || '';

  // Default tanggal & jam pengajuan = sekarang, tetap bisa diubah/diedit.
  const now = currentDateTime();

  container.innerHTML = `
    <form id="ticketForm" class="card" novalidate>
      <!-- ============ INFORMASI UMUM ============ -->
      <section class="form-section">
        <h3>Informasi Umum</h3>

        <!-- ===== Baris 1: Ticket Title | Jenis Layanan | Priority | Kanal Pelaporan ===== -->
        <div class="form-row form-row-main">
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
            <span>Cabang</span>
            <select name="branch_id" id="fBranch">
              ${options(lookups.branches, { placeholder: '-- Pilih Cabang --' })}
            </select>
          </label>
        </div>

        <!-- ===== Baris 2 (kelompok khusus): Tanggal | Jam | Problem Description ===== -->
        <div class="form-subgroup">
          <div class="form-subgroup-head">
            <i class="bi bi-clock-history"></i>
            Waktu Pengajuan &amp; Kronologi
          </div>
          <div class="form-row form-row-detail">
            <label class="field">
              <span>Tanggal Pengajuan</span>
              <input type="date" name="submitted_date" id="fSubmittedDate" required
                     value="${now.date}" />
            </label>

            <label class="field">
              <span>Jam Pengajuan</span>
              <input type="time" name="submitted_time" id="fSubmittedTime" step="1" required
                     value="${now.time}" />
            </label>

            <label class="field col-wide">
              <span>Problem Description</span>
              <textarea name="description" id="fDescription"
                placeholder="Jelaskan kronologi, gejala, dan dampak layanan…"></textarea>
            </label>
          </div>
        </div>

        <div id="slaPreview" class="card"
             style="margin-top:14px;padding:13px 15px;background:rgba(34,211,238,0.07);border-color:rgba(34,211,238,0.25)">
          <div class="muted" style="font-size:0.82rem">
            Pilih <strong>Jenis Layanan</strong> dan <strong>Priority</strong> untuk melihat SLA yang berlaku.
          </div>
        </div>
      </section>

      <!-- ============ ACCESS (hanya untuk Jenis Layanan "Access") ============ -->
      <section class="form-section" data-access-only hidden>
        <h3>Access</h3>
        <div class="form-grid">
          <label class="field">
            <span>CID</span>
            <input type="text" name="cid" id="fCid" placeholder="CID-JKT-BDG-001" />
          </label>

          <label class="field">
            <span>Link Name</span>
            <div id="fLink" data-name="link_id"></div>
          </label>

          <label class="field">
            <span>ISP Name</span>
            <div id="fIsp" data-name="isp_id"></div>
          </label>

          <label class="field">
            <span>Link Name (manual)</span>
            <input type="text" name="link_name" id="fLinkName" placeholder="Diisi otomatis dari Link" />
          </label>
        </div>
      </section>

      <!-- ============ ACCESS / NETWORK (hanya untuk Jenis Layanan "Access") ============ -->
      <section class="form-section" data-access-only hidden>
        <h3>Access / Network</h3>
        <div class="form-grid">
          <label class="field">
            <span>POP (Point of Presence)</span>
            <div id="fPop" data-name="pop_id"></div>
          </label>

          <label class="field">
            <span>MS / Splitter</span>
            <div id="fMs" data-name="ms_splitter_id"></div>
          </label>
        </div>
      </section>

      <!-- ============ PELAPOR & PENANGGUNG JAWAB ============ -->
      <section class="form-section">
        <h3>Pelapor &amp; Penanggung Jawab</h3>
        <div class="form-grid">
          <label class="field">
            <span>Reported By</span>
            <input type="text" name="reported_by" id="fReportedBy" readonly
                   value="${esc(reporterName)}" placeholder="Otomatis dari akun login" />
          </label>

          <label class="field">
            <span>PIC</span>
            <select name="pic_id" id="fPic">
              ${options(lookups.pics, { placeholder: '-- Pilih PIC --' })}
            </select>
          </label>

          <label class="field">
            <span>Regional <span style="color:var(--danger)">*</span></span>
            <select name="regional" id="fRegional" required>
              ${options(REGIONALS.map((r) => ({ id: r, label: r })),
                     { placeholder: '-- Pilih Regional --' })}
            </select>
          </label>
        </div>
      </section>

      <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
        <button type="reset" class="btn btn-ghost" id="fReset"><i class="bi bi-eraser"></i> Bersihkan</button>
        <button type="submit" class="btn btn-primary" id="fSubmit"><i class="bi bi-plus-lg"></i> Buat Tiket</button>
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

  // --- Searchable dropdown: Link Name & ISP Name ---
  // Link Name & ISP Name bisa banyak, jadi memakai combobox yang bisa diketik
  // untuk mencari (bukan <select> native).
  const linkBox = document.getElementById('fLink');
  const ispBox = document.getElementById('fIsp');
  const linkNameInput = document.getElementById('fLinkName');
  const cidInput = document.getElementById('fCid');

  const linkItems = lookups.links.map((l) => ({
    id: l.id,
    label: l.label,
    // Pencarian juga cocok dengan kode & CID link.
    searchText: [l.label, l.code, l.cid].filter(Boolean).join(' '),
    hint: l.cid || '',
  }));
  const ispItems = lookups.isps.map((i) => ({
    id: i.id,
    label: i.label,
    searchText: [i.label, i.code].filter(Boolean).join(' '),
  }));

  createSearchable(linkBox, {
    items: linkItems,
    placeholder: '-- Pilih Link --',
    searchPlaceholder: 'Ketik nama Link…',
    onChange: (value) => {
      const link = lookups.links.find((l) => String(l.id) === String(value));
      if (!link) {
        linkNameInput.value = '';
        return;
      }
      linkNameInput.value = link.label || '';
      // Auto-fill ISP dari Link yang dipilih.
      if (link.isp_id) {
        const isp = lookups.isps.find((i) => String(i.id) === String(link.isp_id));
        if (isp) setSearchableValue(ispBox, isp.id, isp.label);
      }
      if (link.cid && !cidInput.value) cidInput.value = link.cid;
    },
  });

  createSearchable(ispBox, {
    items: ispItems,
    placeholder: '-- Pilih ISP --',
    searchPlaceholder: 'Ketik nama ISP…',
  });

  // --- Searchable dropdown: POP & MS / Splitter ---
  // Kedua daftar ini cukup panjang, jadi memakai combobox yang bisa diketik.
  // Pencarian POP cocok dengan nama, kode, kota, dan provinsi.
  // Pencarian MS / Splitter cocok dengan nama, kode, tipe, status, dan nama POP.
  const popBox = document.getElementById('fPop');
  const msBox = document.getElementById('fMs');

  const popItems = lookups.pops.map((p) => ({
    id: p.id,
    label: p.label,
    searchText: [p.label, p.code, p.city, p.province].filter(Boolean).join(' '),
    hint: [p.code, p.city].filter(Boolean).join(' · '),
  }));
  const msItems = lookups.ms_splitters.map((m) => ({
    id: m.id,
    label: m.label,
    searchText: [m.label, m.code, m.type, m.status, m.pop_name].filter(Boolean).join(' '),
    hint: [m.type, m.pop_name].filter(Boolean).join(' · '),
  }));

  createSearchable(popBox, {
    items: popItems,
    placeholder: '-- Pilih POP --',
    searchPlaceholder: 'Ketik nama/kode POP…',
  });

  createSearchable(msBox, {
    items: msItems,
    placeholder: '-- Pilih MS / Splitter --',
    searchPlaceholder: 'Ketik nama/kode MS…',
  });

  // --- Access-only elements ---
  // Section "Access" dan "Access / Network" hanya relevan untuk service type
  // Access. Saat jenis layanan lain dipilih, elemen disembunyikan dan
  // nilainya dikosongkan agar tidak ikut terkirim ke server.
  const accessSections = Array.from(form.querySelectorAll('[data-access-only]'));
  const ACCESS_FIELD_IDS = ['fCid', 'fLink', 'fIsp', 'fLinkName', 'fPop', 'fMs'];

  function isAccessService() {
    if (!svcSel.value) return false;
    const svc = lookups.service_types.find((s) => String(s.id) === String(svcSel.value));
    if (!svc) return false;
    return String(svc.code || svc.label || '').toUpperCase() === 'ACCESS';
  }

  function syncAccessSections() {
    const show = isAccessService();
    accessSections.forEach((section) => { section.hidden = !show; });
    if (!show) {
      ACCESS_FIELD_IDS.forEach((id) => {
        clearField(document.getElementById(id));
      });
    }
  }

  svcSel.addEventListener('change', syncAccessSections);
  syncAccessSections();

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
    // Tanggal & jam pengajuan: keduanya wajib (dan boleh diubah/diedit).
    if (!payload.submitted_date || !payload.submitted_time) {
      toast('Tanggal & Jam Pengajuan wajib diisi', 'err');
      (payload.submitted_date ? document.getElementById('fSubmittedTime')
                              : document.getElementById('fSubmittedDate')).focus();
      return;
    }
    // Regional wajib karena menjadi bagian dari nomor tiket
    // (contoh: NOCCENTRAL/2026/11/00001).
    if (!payload.regional) {
      toast('Regional wajib dipilih', 'err');
      document.getElementById('fRegional').focus();
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Menyimpan…';
    try {
      const { data } = await api.createTicket(payload);
      toast(`Tiket ${data.ticket_number} berhasil dibuat`, 'ok');
      form.reset();
      resetSearchables();
      syncAccessSections();
      applyNowDefaults();
      window.dispatchEvent(new CustomEvent('synoc:navigate', { detail: { view: 'ticket', id: data.id } }));
    } catch (err) {
      toast(err.message || 'Gagal membuat tiket', 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Buat Tiket';
    }
  });

  /** Kosongkan dropdown searchable (form.reset() tidak menyentuh tampilannya). */
  function resetSearchables() {
    [linkBox, ispBox, popBox, msBox].forEach((box) => resetSearchable(box));
  }

  // Tombol "Bersihkan" (type=reset) hanya mengembalikan input native;
  // teks combobox + placeholder perlu dikembalikan sendiri.
  form.addEventListener('reset', () => {
    setTimeout(() => {
      resetSearchables();
      applyNowDefaults();
    }, 0);
  });

  /** Kembalikan tanggal & jam pengajuan ke waktu sekarang. */
  function applyNowDefaults() {
    const t = currentDateTime();
    const dEl = document.getElementById('fSubmittedDate');
    const tEl = document.getElementById('fSubmittedTime');
    if (dEl) dEl.value = t.date;
    if (tEl) tEl.value = t.time;
  }

  document.getElementById('fReset').addEventListener('click', () => {
    setTimeout(() => {
      resetSearchables();
      refreshSla();
      syncAccessSections();
      applyNowDefaults();
    }, 0);
  });
}
