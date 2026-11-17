/**
 * SYNOC — shared UI helpers.
 */

/** Escape a value for safe interpolation into HTML. */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Human label for a status key. */
export const STATUS_LABEL = {
  open: 'Open',
  in_progress: 'In Progress',
  pending_customer: 'Pending Customer',
  escalated: 'Escalated',
  resolved: 'Resolved',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

/** Status badge markup. */
export function statusBadge(status) {
  return `<span class="badge b-${esc(status)}"><span class="badge-dot"></span>${esc(STATUS_LABEL[status] || status)}</span>`;
}

/** Priority pill using the colour from master data. */
export function priorityPill(name, color) {
  const c = color || '#64748b';
  return `<span class="pill" style="background:${esc(c)}22;color:${esc(c)};border-color:${esc(c)}55">${esc(name || '—')}</span>`;
}

/** Relative time from an ISO/MySQL timestamp. */
export function relative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const units = [
    ['y', 31536e6], ['mo', 2592e6], ['d', 864e5],
    ['h', 36e5], ['m', 6e4], ['s', 1000],
  ];
  for (const [label, ms] of units) {
    const n = Math.floor(abs / ms);
    if (n >= 1) return diff >= 0 ? `${n}${label} lalu` : `dalam ${n}${label}`;
  }
  return 'baru saja';
}

/** Absolute timestamp for display. */
export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Duration in minutes → human string. */
export function fmtDuration(minutes) {
  if (minutes === null || minutes === undefined) return '—';
  const m = Number(minutes);
  if (!Number.isFinite(m)) return '—';
  const abs = Math.abs(m);
  if (abs < 60) return `${Math.round(m)} mnt`;
  const h = Math.floor(abs / 60);
  const rem = Math.round(abs % 60);
  if (h < 24) return rem ? `${h}j ${rem}m` : `${h}j`;
  const d = Math.floor(h / 24);
  return `${d}h ${h % 24}j`;
}

/**
 * SLA meter for a ticket row.
 * @param {object} row  ticket row with created_at / resolution_due_at / sla_overdue
 */
export function slaMeter(row) {
  if (!row?.resolution_due_at) {
    return '<div class="sla-info"><small>Tanpa SLA</small></div>';
  }
  const total = new Date(row.resolution_due_at) - new Date(row.created_at);
  const now = Date.now();
  const done = Math.min(Math.max(now - new Date(row.created_at), 0), total);
  const pct = total > 0 ? Math.round((done / total) * 100) : 100;
  const closed = ['resolved', 'closed', 'cancelled'].includes(row.status);
  const breached = row.sla_overdue || row.resolution_breached;

  let cls = 'sla-ok';
  if (breached) cls = 'sla-breach';
  else if (!closed && pct > 75) cls = 'sla-warn';
  else if (closed) cls = row.resolution_breached ? 'sla-breach' : 'sla-ok';

  const label = breached
    ? 'Terlanggar'
    : closed ? 'Tercapai' : `${pct}% terpakai`;

  return `<div class="sla-info">
    <div class="sla-meter ${cls}"><span style="width:${Math.max(pct, 3)}%"></span></div>
    <small>${esc(label)}</small>
  </div>`;
}

/** Toast notification. */
export function toast(message, kind = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast ${kind}`;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, 3600);
}

/** Open the modal with given title and HTML body. */
export function openModal(title, html, onMount) {
  const backdrop = document.getElementById('modalBackdrop');
  document.getElementById('modalTitle').textContent = title;
  const body = document.getElementById('modalBody');
  body.innerHTML = html;
  backdrop.hidden = false;
  if (onMount) onMount(body);
}

export function closeModal() {
  document.getElementById('modalBackdrop').hidden = true;
  document.getElementById('modalBody').innerHTML = '';
}

/** Render a simple empty state. */
export function emptyState(icon, message) {
  return `<div class="empty"><div class="empty-icon">${icon}</div><p>${esc(message)}</p></div>`;
}

/**
 * Build an option list for a <select>.
 */
export function options(items, { valueKey = 'id', labelKey = 'label', selected = null, placeholder = null } = {}) {
  let html = '';
  if (placeholder !== null) {
    html += `<option value="">${esc(placeholder)}</option>`;
  }
  for (const item of items || []) {
    const v = item[valueKey];
    const l = item[labelKey];
    const sel = String(selected ?? '') === String(v) ? ' selected' : '';
    html += `<option value="${esc(v)}"${sel}>${esc(l)}</option>`;
  }
  return html;
}

/** Simple debounce. */
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
