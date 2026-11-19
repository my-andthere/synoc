/**
 * SYNOC — ticket detail (modal view): full fields, SLA panel, timeline, actions.
 */
import { api } from '../lib/api.js';
import {
  esc, relative, fmtDate, fmtDuration, statusBadge, priorityPill, options, toast, openModal,
} from '../lib/ui.js';

const STATUSES = ['open', 'in_progress', 'pending_customer', 'escalated', 'resolved', 'closed', 'cancelled'];

/** Batas lampiran per catatan (harus sama dengan batas server). */
const MAX_ATTACH = 6;
const MAX_ATTACH_SIZE = 5 * 1024 * 1024;

/**
 * Jam default untuk field "Jam" (waktu lokal browser).
 * Pengguna tetap boleh mengubahnya sebelum menambah catatan.
 */
function currentTime() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export async function showTicket(id) {
  openModal('Memuat…', '<div class="skeleton" style="height:300px"></div>');

  const { data: t, events, sla, attachments } = await api.ticket(id);
  const users = (await api.users(true)).data;
  // Master data PIC (Person in Charge) — sumber dropdown di form & detail.
  const pics = (await api.masterOptions('pic')).data.map((p) => ({
    id: p.id,
    label: p.position ? `${p.name} — ${p.position}` : p.name,
  }));

  // Lampiran gambar per event timeline. Dimuat sebagai blob URL supaya
  // token tidak pernah muncul di URL.
  const attachmentsByEvent = new Map();
  for (const att of attachments || []) {
    let url = '';
    try {
      url = await api.attachmentBlobUrl(att.id);
    } catch {
      url = ''; // lampiran gagal dimuat -> tampilkan placeholder
    }
    const item = { ...att, url };
    if (!attachmentsByEvent.has(att.event_id)) attachmentsByEvent.set(att.event_id, []);
    attachmentsByEvent.get(att.event_id).push(item);
  }

  const overdue = t.sla_overdue;
  const closed = ['resolved', 'closed', 'cancelled'].includes(t.status);

  // Section "Access & Network" hanya relevan untuk jenis layanan Access.
  const isAccess = String(t.service_type_code || '').toUpperCase() === 'ACCESS';

  // Regional disimpan sebagai kode WEST / CENTRAL / EAST.
  const regional = String(t.regional || '').toUpperCase();
  const regionalBadge = regional
    ? `<span class="badge b-neutral mono">${esc(regional)}</span>`
    : '';

  // Jam default untuk kolom catatan.
  const nowTime = currentTime();

  const body = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
      <span class="badge b-neutral mono">${esc(t.ticket_number)}</span>
      ${statusBadge(t.status)}
      ${priorityPill(t.priority_name, t.priority_color)}
      <span class="badge b-neutral">${esc(t.service_type_name)}</span>
      ${regionalBadge}
      ${overdue ? '<span class="badge b-breach"><i class="bi bi-exclamation-triangle"></i> SLA Terlanggar</span>' : ''}
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

    <!-- Access / Network (hanya untuk jenis layanan Access) -->
    ${isAccess ? `
    <div class="form-section">
      <h3>Access &amp; Network</h3>
      <dl class="detail-grid">
        ${cell('CID', t.cid)}
        ${cell('Link Name', t.link_name)}
        ${cell('ISP Name', t.isp_name)}
        ${cell('POP', t.pop_name)}
        ${cell('MS / Splitter', t.ms_splitter_name)}
      </dl>
    </div>` : ''}

    <!-- Informasi Umum -->
    <div class="form-section">
      <h3>Informasi Umum</h3>
      <dl class="detail-grid">
        ${cell('Ticket Title', t.title)}
        ${cell('Priority', `${t.priority_name} (${t.sla_resolution_hours}h)`)}
        ${cell('Kanal Pelaporan', t.channel_name)}
        ${cell('Cabang', t.branch_name)}
        ${cell('Customer', t.customer_name_master || t.customer_name)}
        ${cell('Reported By', t.reported_by)}
        ${cell('PIC', t.pic_name)}
        ${cell('Handler', t.assignee_name)}
        ${cell('Regional', regional || null)}
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
          <span>PIC</span>
          <select id="aPic">
            ${options(pics, { selected: t.pic_id, placeholder: '-- Tidak ada --' })}
          </select>
        </label>
        <label class="field">
          <span>Handler (NOC)</span>
          <select id="aAssignee">
            ${options(users.map((u) => ({ id: u.id, label: u.full_name })), { selected: t.assigned_to, placeholder: '-- Tidak ada --' })}
          </select>
        </label>
        <label class="field">
          <span>Jam</span>
          <input type="time" id="aNoteTime" step="1" value="${nowTime}"
                 title="Jam kejadian catatan (opsional — default waktu server)" />
        </label>
        <label class="field span-2">
          <span>Catatan</span>
          <input type="text" id="aNote" placeholder="Catatan untuk timeline…" />
        </label>

        <!-- ===== Lampiran gambar pada catatan =====
             Bisa diisi dengan: tarik-lepas, pilih berkas, atau tempel (Ctrl+V). -->
        <div class="field span-full attach-field">
          <span>Lampiran Gambar</span>
          <div class="attach-drop" id="aDrop" tabindex="0" role="button"
               aria-label="Tarik-lepas gambar, klik untuk memilih berkas, atau tempel dari clipboard">
            <i class="bi bi-cloud-arrow-up"></i>
            <div class="attach-drop-main">Tarik gambar ke sini, <u>klik untuk pilih</u>, atau <u>tempel</u> (Ctrl+V)</div>
            <div class="attach-drop-hint">JPG · PNG · GIF · WebP · BMP — maks. 5 MB per gambar, 6 gambar per catatan</div>
            <input type="file" id="aFiles" accept="image/*" multiple hidden />
          </div>
          <div class="attach-list" id="aAttachList" hidden></div>
        </div>
      </div>
      <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:6px">
        <button class="btn btn-primary btn-sm" id="aSaveAll"><i class="bi bi-check-lg"></i> Simpan</button>
      </div>
    </div>

    <!-- Timeline -->
    <div class="form-section">
      <h3>Timeline</h3>
      <div class="timeline">
        ${events.length ? events.map((e) => eventItem(e, attachmentsByEvent.get(e.id))).join('') : '<p class="muted">Belum ada aktivitas.</p>'}
      </div>
    </div>
  `;

  openModal(t.ticket_number, body, (modalBody) => {
    // Jam yang dipilih dipakai untuk entri timeline yang memakai kolom Catatan.
    const noteTime = () => modalBody.querySelector('#aNoteTime').value || null;

    /** Gambar yang sudah dipilih (belum diunggah). */
    let pickedFiles = [];

    /**
     * Satu tombol "Simpan": hanya field yang berubah yang dikirim
     * (status, PIC, handler), lalu catatan + lampiran gambar.
     */
    modalBody.querySelector('#aSaveAll').addEventListener('click', async () => {
      const status = modalBody.querySelector('#aStatus').value;
      const picVal = modalBody.querySelector('#aPic').value;
      const assigneeVal = modalBody.querySelector('#aAssignee').value;
      const note = modalBody.querySelector('#aNote').value.trim();

      const picId = picVal ? Number(picVal) : null;
      const assigneeId = assigneeVal ? Number(assigneeVal) : null;

      const statusChanged = status !== t.status;
      const picChanged = picId !== (t.pic_id != null ? Number(t.pic_id) : null);
      const assigneeChanged = assigneeId !== (t.assigned_to != null ? Number(t.assigned_to) : null);
      const hasFiles = pickedFiles.length > 0;

      if (!statusChanged && !picChanged && !assigneeChanged && !note && !hasFiles) {
        toast('Tidak ada perubahan untuk disimpan', 'err');
        return;
      }

      const btn = modalBody.querySelector('#aSaveAll');
      btn.disabled = true;
      const original = btn.innerHTML;
      btn.innerHTML = 'Menyimpan…';

      const done = [];
      try {
        if (statusChanged) {
          // Jika ada lampiran, catatan ikut entri lampiran agar tidak tercatat dua kali.
          await api.setStatus(id, status, hasFiles ? null : (note || null), noteTime());
          done.push('status');
        }
        if (picChanged) {
          await api.updateTicket(id, { pic_id: picId });
          done.push('PIC');
        }
        if (assigneeChanged) {
          await api.assign(id, assigneeId);
          done.push('handler');
        }
        if (hasFiles) {
          // Catatan + lampiran dikirim sebagai satu multipart/form-data.
          await api.addEventWithFiles(id, note || '(Lampiran)', 'note', noteTime(), pickedFiles);
          done.push(`${pickedFiles.length} lampiran`);
          pickedFiles = [];
        } else if (note && !statusChanged) {
          await api.addEvent(id, note, 'note', noteTime());
          done.push('catatan');
        }

        toast(`Tersimpan: ${done.join(', ')}`, 'ok');
        await showTicket(id);
        window.dispatchEvent(new CustomEvent('synoc:refresh'));
      } catch (err) {
        toast(done.length
          ? `Sebagian tersimpan (${done.join(', ')}). Gagal: ${err.message}`
          : (err.message || 'Gagal menyimpan'), 'err');
        if (done.length) {
          await showTicket(id);
          window.dispatchEvent(new CustomEvent('synoc:refresh'));
        } else {
          btn.disabled = false;
          btn.innerHTML = original;
        }
      }
    });

    // -------------------------------------------------------------------
    // Lampiran gambar: tarik-lepas, pilih berkas, tempel (Ctrl+V)
    // -------------------------------------------------------------------
    const drop = modalBody.querySelector('#aDrop');
    const fileInput = modalBody.querySelector('#aFiles');
    const list = modalBody.querySelector('#aAttachList');

    function renderPicked() {
      if (!pickedFiles.length) {
        list.hidden = true;
        list.innerHTML = '';
        return;
      }
      list.hidden = false;
      list.innerHTML = pickedFiles.map((f, i) => `
        <div class="attach-chip" data-i="${i}">
          <img src="${f.preview}" alt="${esc(f.name)}" />
          <div class="attach-chip-meta">
            <span class="attach-chip-name" title="${esc(f.name)}">${esc(f.name)}</span>
            <span class="attach-chip-size">${formatBytes(f.size)}</span>
          </div>
          <button type="button" class="attach-chip-x" data-remove="${i}"
                  title="Hapus lampiran" aria-label="Hapus lampiran">&times;</button>
        </div>`).join('');
    }

    function addFiles(fileList) {
      const incoming = Array.from(fileList || []).filter((f) => f && f.type.startsWith('image/'));
      if (!incoming.length) {
        if (fileList && fileList.length) toast('Hanya berkas gambar yang dapat dilampirkan', 'err');
        return;
      }
      const room = MAX_ATTACH - pickedFiles.length;
      if (room <= 0) {
        toast(`Maksimal ${MAX_ATTACH} gambar per catatan`, 'err');
        return;
      }
      const accepted = incoming.slice(0, room);
      if (incoming.length > room) {
        toast(`Maksimal ${MAX_ATTACH} gambar per catatan — ${incoming.length - room} gambar dilewati`, 'err');
      }
      for (const file of accepted) {
        if (file.size > MAX_ATTACH_SIZE) {
          toast(`"${file.name}" terlalu besar (maks. 5 MB)`, 'err');
          continue;
        }
        pickedFiles.push({ file, name: file.name, size: file.size, preview: URL.createObjectURL(file) });
      }
      renderPicked();
    }

    // Klik / Enter pada zona = pilih berkas.
    drop.addEventListener('click', () => fileInput.click());
    drop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener('change', () => {
      addFiles(fileInput.files);
      fileInput.value = '';
    });

    // Tarik-lepas.
    ['dragenter', 'dragover'].forEach((evt) => {
      drop.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        drop.classList.add('is-over');
      });
    });
    ['dragleave', 'dragend'].forEach((evt) => {
      drop.addEventListener(evt, (e) => {
        e.preventDefault();
        drop.classList.remove('is-over');
      });
    });
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      drop.classList.remove('is-over');
      if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
    });

    // Tempel dari clipboard (screenshot / copy gambar).
    const onPaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files = [];
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        addFiles(files);
        toast(`${files.length} gambar ditempel`, 'ok');
      }
    };
    modalBody.addEventListener('paste', onPaste);

    // Hapus satu lampiran.
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove]');
      if (!btn) return;
      const i = Number(btn.dataset.remove);
      const removed = pickedFiles.splice(i, 1)[0];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      renderPicked();
    });

    // Bersihkan object URL saat popup ditutup.
    const cleanup = () => {
      pickedFiles.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
      pickedFiles = [];
      modalBody.removeEventListener('paste', onPaste);
    };
    modalBody.closest('.modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'modalBackdrop') cleanup();
    });
  });
}

/** Format ukuran berkas untuk tampilan. */
function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function cell(label, value, mono = false) {
  return `<div class="detail-cell">
    <dt>${esc(label)}</dt>
    <dd class="${mono ? 'mono' : ''}" style="font-size:0.85rem">${value ? esc(value) : '—'}</dd>
  </div>`;
}

function eventItem(e, attachments = []) {
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
    ? `${esc(e.from_value)} <i class="bi bi-arrow-right"></i> ${esc(e.to_value)}`
    : (e.to_value || '');

  // Galeri lampiran gambar pada entri timeline ini.
  const gallery = attachments?.length ? `
    <div class="tl-gallery">
      ${attachments.map((a) => `
        <a class="tl-thumb" href="${a.url || '#'}" target="_blank" rel="noopener"
           title="${esc(a.file_name)}">
          ${a.url
            ? `<img src="${a.url}" alt="${esc(a.file_name)}" loading="lazy" />`
            : `<span class="tl-thumb-missing"><i class="bi bi-image"></i></span>`}
        </a>`).join('')}
    </div>` : '';

  return `<div class="tl-item ${e.event_type === 'sla_breach' ? 'breach' : ''}">
    <div class="tl-head">
      <strong>${esc(label)}</strong>
      ${detail ? `<span class="muted">${detail}</span>` : ''}
      <time>${esc(fmtDate(e.created_at))} · ${esc(e.user_name || 'system')}</time>
    </div>
    ${e.note ? `<div class="tl-body">${esc(e.note)}</div>` : ''}
    ${gallery}
  </div>`;
}
