/**
 * SYNOC — ticket edit modal (khusus admin).
 *
 * Popup ini dipakai oleh tombol "Edit" pada tabel utama Tickets. Selain status,
 * PIC dan handler (yang sudah ada di popup detail), admin juga dapat mengubah
 * data induk tiket: judul, jenis layanan, prioritas, kanal, PIC, deskripsi dan
 * Regional.
 *
 * Kalau Regional diubah, backend otomatis menomori ulang tiket agar nomor
 * mengikuti regional baru (lihat src/routes/tickets.js).
 */
import { api } from '../lib/api.js';
import { esc, options, toast, openModal, closeModal } from '../lib/ui.js';

const REGIONALS = ['WEST', 'CENTRAL', 'EAST'];

/**
 * Buka popup edit tiket.
 * @param {string|number} id         id tiket
 * @param {Function}     [onSaved]   dipanggil dengan data tiket setelah disimpan
 */
export async function showTicketEdit(id, onSaved) {
  openModal('Memuat…', '<div class="skeleton" style="height:260px"></div>');

  const [ticketRes, priorities, serviceTypes, channels, pics] = await Promise.all([
    api.ticket(id),
    api.masterOptions('priority'),
    api.masterOptions('service_type'),
    api.masterOptions('channel'),
    api.masterOptions('pic'),
  ]);

  const t = ticketRes.data;
  const picOptions = pics.data.map((p) => ({
    id: p.id,
    label: p.position ? `${p.name} — ${p.position}` : p.name,
  }));

  const body = `
    <form id="editForm" autocomplete="off">
      <div class="form-section">
        <h3>Data Tiket</h3>
        <div class="form-grid">
          <label class="field span-2">
            <span>Judul Tiket <span style="color:var(--danger)">*</span></span>
            <input type="text" id="eTitle" value="${esc(t.title || '')}" required />
          </label>

          <label class="field">
            <span>Regional <span style="color:var(--danger)">*</span></span>
            <select id="eRegional" required>
              ${options(REGIONALS.map((r) => ({ id: r, label: r })), {
                selected: t.regional, placeholder: '-- Pilih Regional --',
              })}
            </select>
            <small class="muted">Perubahan regional akan menomori ulang tiket.</small>
          </label>

          <label class="field">
            <span>Jenis Layanan <span style="color:var(--danger)">*</span></span>
            <select id="eService" required>
              ${options(serviceTypes.data, { selected: t.service_type_id })}
            </select>
          </label>

          <label class="field">
            <span>Prioritas <span style="color:var(--danger)">*</span></span>
            <select id="ePriority" required>
              ${options(priorities.data, { selected: t.priority_id })}
            </select>
          </label>

          <label class="field">
            <span>Kanal Pelaporan</span>
            <select id="eChannel">
              ${options(channels.data, { selected: t.channel_id, placeholder: '-- Tidak ada --' })}
            </select>
          </label>

          <label class="field">
            <span>PIC</span>
            <select id="ePic">
              ${options(picOptions, { selected: t.pic_id, placeholder: '-- Tidak ada --' })}
            </select>
          </label>

          <label class="field span-2">
            <span>Problem Description</span>
            <textarea id="eDescription" rows="4">${esc(t.description || '')}</textarea>
          </label>
        </div>
      </div>

      <div style="display:flex;gap:9px;justify-content:flex-end;margin-top:14px">
        <button type="button" class="btn btn-ghost btn-sm" id="eCancel">
          <i class="bi bi-x-lg"></i> Batal
        </button>
        <button type="submit" class="btn btn-primary btn-sm" id="eSave">
          <i class="bi bi-check-lg"></i> Simpan Perubahan
        </button>
      </div>
    </form>
  `;

  openModal(`Edit Tiket ${t.ticket_number}`, body, (modalBody) => {
    modalBody.querySelector('#eCancel').addEventListener('click', closeModal);

    const form = modalBody.querySelector('#editForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const regional = modalBody.querySelector('#eRegional').value;
      if (!regional) {
        toast('Regional wajib dipilih', 'err');
        modalBody.querySelector('#eRegional').focus();
        return;
      }

      const payload = {
        title: modalBody.querySelector('#eTitle').value.trim(),
        regional,
        service_type_id: modalBody.querySelector('#eService').value || null,
        priority_id: modalBody.querySelector('#ePriority').value || null,
        channel_id: modalBody.querySelector('#eChannel').value || null,
        pic_id: modalBody.querySelector('#ePic').value || null,
        description: modalBody.querySelector('#eDescription').value,
      };

      const btn = modalBody.querySelector('#eSave');
      btn.disabled = true;
      try {
        const { data } = await api.updateTicket(id, payload);
        closeModal();
        const nomor = data?.ticket_number || '-';
        toast(`Tiket diperbarui — nomor: ${nomor}`, 'ok');
        if (typeof onSaved === 'function') onSaved(data);
      } catch (err) {
        toast(err.message || 'Gagal menyimpan perubahan', 'err');
        btn.disabled = false;
      }
    });
  });
}
