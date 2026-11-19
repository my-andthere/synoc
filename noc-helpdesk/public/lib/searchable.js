/**
 * SYNOC — searchable dropdown (combobox).
 *
 * Dropdown native `<select>` tidak bisa diketik. Komponen ini menggantinya
 * dengan: input teks untuk mengetik + daftar pilihan yang difilter, tanpa
 * dependensi eksternal.
 *
 * Kontrak markup (dibuat otomatis oleh `createSearchable`):
 *   <div class="ss" id="fLink">
 *     <input type="text" class="ss-input" role="combobox" …>
 *     <button type="button" class="ss-clear">…</button>
 *     <span class="ss-arrow">…</span>
 *     <input type="hidden" name="link_id">
 *     <div class="ss-menu" role="listbox">…</div>
 *   </div>
 *
 * API:
 *   createSearchable(el, { items, value, placeholder, onChange })
 *   setSearchableValue(el, value, label)   — isi tanpa event
 *   getSearchableValue(el)
 *   resetSearchable(el)                    — kosongkan + tutup daftar
 *   clearField(el)                         — aman untuk input biasa & searchable
 */

/** Box yang sedang terbuka (hanya satu pada satu waktu). */
let openBox = null;

document.addEventListener('click', (e) => {
  if (!openBox) return;
  if (openBox.contains(e.target)) return;
  closeMenu(openBox);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openBox) {
    closeMenu(openBox);
    e.stopPropagation();
  }
});

/** Hitung teks yang dipakai untuk pencocokan pencarian. */
function searchText(item) {
  if (item.searchText) return String(item.searchText).toLowerCase();
  return String(item.label ?? '').toLowerCase();
}

/** Tutup daftar pilihan. */
function closeMenu(box) {
  if (!box) return;
  const { menu, input } = box._ss;
  menu.hidden = true;
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
  box._ss.activeIndex = -1;
  if (openBox === box) openBox = null;
}

/** Buka daftar pilihan. `keepQuery` dipakai saat pengguna sedang mengetik. */
function openMenu(box, keepQuery = false) {
  if (!box) return;
  if (openBox && openBox !== box) closeMenu(openBox);
  if (!keepQuery) box._ss.query = '';
  box._ss.menu.hidden = false;
  box._ss.input.setAttribute('aria-expanded', 'true');
  openBox = box;
  renderItems(box);
}

/** Render daftar item sesuai query pencarian. */
function renderItems(box) {
  const { menu, input, items, listId } = box._ss;
  const q = box._ss.query.trim().toLowerCase();
  const matched = q ? items.filter((it) => searchText(it).includes(q)) : items.slice();

  menu.innerHTML = matched.length
    ? matched.map((it, i) => `
        <button type="button" class="ss-item" role="option" id="${listId}-${i}"
                data-value="${escapeAttr(it.id)}" aria-selected="false">
          <span>${escapeHtml(it.label)}</span>
          ${it.hint ? `<small>${escapeHtml(it.hint)}</small>` : ''}
        </button>`).join('')
    : '<div class="ss-empty">Tidak ada yang cocok</div>';

  box._ss.matched = matched;
  box._ss.activeIndex = -1;
  if (!matched.length) input.removeAttribute('aria-activedescendant');
}

/** Escape untuk atribut HTML. */
function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escape untuk teks HTML. */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Buat / pasang dropdown searchable pada sebuah elemen container.
 *
 * @param {HTMLElement} el       container (wajib punya atribut id)
 * @param {object}      opts
 * @param {Array}       opts.items       [{ id, label, hint?, searchText? }]
 * @param {string}      [opts.value]     id terpilih
 * @param {string}      [opts.placeholder] teks saat kosong
 * @param {string}      [opts.searchPlaceholder] placeholder input pencarian
 * @param {Function}    [opts.onChange]  dipanggil setelah nilai berubah
 */
export function createSearchable(el, { items = [], value = '', placeholder = '', searchPlaceholder = 'Ketik untuk mencari…', onChange } = {}) {
  if (!el) return null;

  const name = el.dataset.name;
  if (!name) {
    console.warn('createSearchable: elemen perlu atribut data-name', el);
    return null;
  }

  const listId = `${el.id}-list`;
  el.classList.add('ss');
  el.innerHTML = `
    <input type="text" class="ss-input" role="combobox" aria-autocomplete="list"
           aria-expanded="false" aria-controls="${listId}" autocomplete="off"
           spellcheck="false" placeholder="${escapeAttr(placeholder || searchPlaceholder)}" />
    <button type="button" class="ss-clear" title="Kosongkan" hidden><i class="bi bi-x-circle-fill"></i></button>
    <span class="ss-arrow" aria-hidden="true"><i class="bi bi-chevron-down"></i></span>
    <input type="hidden" name="${escapeAttr(name)}" value="${escapeAttr(value)}" />
    <div class="ss-menu" id="${listId}" role="listbox" hidden></div>
  `;

  const input = el.querySelector('.ss-input');
  const hidden = el.querySelector('input[type="hidden"]');
  const menu = el.querySelector('.ss-menu');
  const clearBtn = el.querySelector('.ss-clear');

  el._ss = {
    items: items.slice(),
    matched: [],
    query: '',
    activeIndex: -1,
    input,
    hidden,
    menu,
    clearBtn,
    listId,
    placeholder,
    searchPlaceholder,
    onChange,
  };

  const current = items.find((i) => String(i.id) === String(value));
  if (current) input.value = current.label;

  /**
   * Placeholder input:
   *   - 'idle'  → teks "-- Pilih X --" (komponen kosong)
   *   - 'search' → teks "Ketik untuk mencari…"
   */
  function setPlaceholder(mode) {
    input.placeholder = mode === 'search'
      ? searchPlaceholder
      : (placeholder || searchPlaceholder);
  }
  el._ss.setPlaceholder = setPlaceholder;

  const emit = () => {
    if (typeof el._ss.onChange === 'function') el._ss.onChange(el._ss.hidden.value, el);
  };

  // --- buka daftar ---
  input.addEventListener('focus', () => {
    el._ss.query = '';
    setPlaceholder('search');
    openMenu(el);
    // Bila sudah ada nilai terpilih (fokus via keyboard), seluruh teks
    // diselect agar mengetik langsung menggantikan nilai lama.
    if (el._ss.hidden.value) input.select();
  });
  // Klik pada input yang sudah terisi: teks lama harus langsung terpilih
  // seluruhnya, agar mengetik mengGANTIK bukan menambah di akhir.
  input.addEventListener('mousedown', (e) => {
    if (!el._ss.hidden.value) return;
    // Hanya bila isinya masih label yang tersimpan (bukan teks filter
    // milik pengguna) — kalau sudah diketik, teksnya tidak boleh hilang.
    const committed = el._ss.items.find((i) => String(i.id) === String(el._ss.hidden.value));
    if (!committed || input.value !== committed.label) return;
    e.preventDefault();
    input.focus();
    input.select();
  });
  input.addEventListener('click', () => {
    setPlaceholder('search');
    // Kalau daftar sudah terbuka, JANGAN reset filter — pengguna mungkin
    // sedang mengetik dan hanya ingin melihat hasil yang sama.
    if (el._ss.menu.hidden) {
      el._ss.query = '';
      openMenu(el);
    }
  });
  input.addEventListener('input', () => {
    el._ss.query = input.value;
    setPlaceholder('search');
    openMenu(el, true);
  });
  // Blur: kalau tidak ada item yang dipilih, teks ketikan dikembalikan
  // (agar tampilan tidak menyesatkan: teks ada tapi nilainya kosong).
  input.addEventListener('blur', () => {
    if (!el._ss.hidden.value) {
      el._ss.input.value = '';
      el._ss.query = '';
    }
    setPlaceholder('idle');
  });

  // --- klik item ---
  // `mousedown` dicegat agar input TIDAK kehilangan fokus saat item diklik.
  // Tanpa ini, event `blur` berjalan lebih dulu dan mengosongkan teks yang
  // sedang diketik sebelum nilai item sempat tersimpan.
  menu.addEventListener('mousedown', (e) => e.preventDefault());
  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('.ss-item');
    if (!btn) return;
    e.preventDefault();
    const item = el._ss.matched.find((m) => String(m.id) === btn.dataset.value);
    if (!item) return;
    el._ss.hidden.value = item.id;
    input.value = item.label;
    el._ss.query = '';
    el._ss.clearBtn.hidden = !el._ss.hidden.value;
    closeMenu(el);
    setPlaceholder('idle');
    emit();
  });

  // --- kosongkan ---
  clearBtn.addEventListener('mousedown', (e) => e.preventDefault());
  clearBtn.addEventListener('click', (e) => {
    e.preventDefault();
    el._ss.hidden.value = '';
    input.value = '';
    el._ss.query = '';
    el._ss.clearBtn.hidden = true;
    closeMenu(el);
    setPlaceholder('idle');
    input.focus();
    emit();
  });

  // --- navigasi keyboard ---
  input.addEventListener('keydown', (e) => {
    const list = el._ss.matched;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (el._ss.menu.hidden) { openMenu(el); return; }
      if (!list.length) return;
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      let next = el._ss.activeIndex + delta;
      if (next < 0) next = list.length - 1;
      if (next >= list.length) next = 0;
      el._ss.activeIndex = next;
      const opts = menu.querySelectorAll('.ss-item');
      opts.forEach((o, i) => o.classList.toggle('is-active', i === next));
      opts[next]?.scrollIntoView({ block: 'nearest' });
      input.setAttribute('aria-activedescendant', `${listId}-${next}`);
    } else if (e.key === 'Enter') {
      // Enter di dalam combobox TIDAK boleh submitting form induk
      // (mis. form "Tiket Baru"), jadi selalu dicegat.
      e.preventDefault();
      if (!el._ss.menu.hidden && el._ss.activeIndex >= 0) {
        const item = list[el._ss.activeIndex];
        el._ss.hidden.value = item.id;
        input.value = item.label;
        el._ss.query = '';
        el._ss.clearBtn.hidden = !el._ss.hidden.value;
        closeMenu(el);
        setPlaceholder('idle');
        emit();
      }
    } else if (e.key === 'Tab') {
      closeMenu(el);
    } else if (e.key === 'Escape') {
      // Escape membatalkan pencarian: teks yang diketik dikembalikan ke
      // nilai yang tersimpan (atau dikosongkan kalau belum ada nilai).
      e.preventDefault();
      e.stopPropagation();
      const committed = el._ss.items.find((i) => String(i.id) === String(el._ss.hidden.value));
      el._ss.input.value = committed ? committed.label : '';
      el._ss.query = '';
      closeMenu(el);
      setPlaceholder('idle');
    }
  });

  el._ss.clearBtn.hidden = !el._ss.hidden.value;
  return el._ss;
}

/** Ambil nilai (id) dari dropdown searchable. */
export function getSearchableValue(el) {
  if (!el) return '';
  if (el.classList?.contains('ss')) return el._ss?.hidden.value ?? '';
  return el.value ?? '';
}

/**
 * Isi dropdown searchable tanpa memicu event.
 * @param {HTMLElement} el
 * @param {string|number} value  id
 * @param {string} label         teks yang ditampilkan
 */
export function setSearchableValue(el, value, label) {
  if (!el) return;
  if (!el.classList?.contains('ss')) { el.value = value ?? ''; return; }
  el._ss.hidden.value = value ?? '';
  el._ss.input.value = label ?? '';
  el._ss.query = '';
  el._ss.clearBtn.hidden = !el._ss.hidden.value;
  closeMenu(el);
  el._ss.setPlaceholder('idle');
}

/** Kosongkan dropdown searchable. */
export function resetSearchable(el) {
  if (!el) return;
  if (!el.classList?.contains('ss')) { el.value = ''; return; }
  el._ss.hidden.value = '';
  el._ss.input.value = '';
  el._ss.query = '';
  el._ss.clearBtn.hidden = true;
  closeMenu(el);
  el._ss.setPlaceholder('idle');
}

/**
 * Kosongkan sebuah field — aman untuk input biasa maupun dropdown searchable.
 */
export function clearField(el) {
  if (!el) return;
  if (el.classList?.contains('ss')) { resetSearchable(el); return; }
  el.value = '';
}
