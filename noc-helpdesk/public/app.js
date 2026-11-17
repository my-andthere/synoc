/**
 * SYNOC — NOC Helpdesk System
 * Application bootstrap, router, and global event wiring.
 */
import { api, session } from './lib/api.js';
import { toast, closeModal, esc } from './lib/ui.js';
import { renderDashboard } from './views/dashboard.js';
import { renderTickets } from './views/tickets.js';
import { renderTicketForm } from './views/ticket-form.js';
import { showTicket } from './views/ticket-detail.js';
import { renderSla } from './views/sla.js';
import { renderMaster } from './views/master.js';

const el = {
  loginScreen: document.getElementById('loginScreen'),
  loginForm: document.getElementById('loginForm'),
  loginError: document.getElementById('loginError'),
  appShell: document.getElementById('appShell'),
  content: document.getElementById('content'),
  pageTitle: document.getElementById('pageTitle'),
  pageSubtitle: document.getElementById('pageSubtitle'),
  nav: document.getElementById('mainNav'),
  liveDot: document.getElementById('liveDot'),
};

const VIEW_TITLES = {
  dashboard: ['Dashboard', 'Ringkasan tiket, SLA, dan aktivitas NOC'],
  tickets: ['Tickets', 'Kelola seluruh tiket helpdesk NOC'],
  'ticket-new': ['Ticket Baru', 'Formulir pelaporan gangguan sesuai format NOC'],
  sla: ['SLA & Prioritas', 'Target waktu penyelesaian dan kebijakan SLA'],
  master: ['Master Data', 'Referensi data pendukung aplikasi'],
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const errBox = el.loginError;
  errBox.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Memproses…';

  try {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const { token, user } = await api.login(username, password);
    session.set(token, user);
    await enterApp();
  } catch (err) {
    errBox.textContent = err.message || 'Login gagal';
    errBox.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Masuk';
  }
}

async function logout() {
  try { await api.logout(); } catch { /* token may already be gone */ }
  session.clear();
  el.appShell.hidden = true;
  el.loginScreen.hidden = false;
  document.getElementById('loginPassword').value = '';
}

async function enterApp() {
  const user = session.user;
  el.loginScreen.hidden = true;
  el.appShell.hidden = false;

  document.getElementById('userName').textContent = user?.full_name || user?.username || '—';
  document.getElementById('userRole').textContent = user?.role || '—';
  document.getElementById('userAvatar').textContent = (user?.full_name || user?.username || '?')
    .trim().charAt(0).toUpperCase();

  await navigate('dashboard');
  checkHealth();
}

/** Poll the health endpoint to show connection state. */
async function checkHealth() {
  try {
    await api.health();
    el.liveDot.classList.remove('off');
    el.liveDot.title = 'API tersambung';
  } catch {
    el.liveDot.classList.add('off');
    el.liveDot.title = 'API terputus';
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

let currentView = null;
let currentResource = null;

async function navigate(view, opts = {}) {
  const content = el.content;

  // Update nav highlight
  document.querySelectorAll('.nav-item').forEach((n) => {
    const isMatch = n.dataset.view === view
      && (!n.dataset.resource || n.dataset.resource === currentResource);
    n.classList.toggle('active', isMatch);
  });

  const title = VIEW_TITLES[view] || [view, ''];
  el.pageTitle.textContent = opts.title || title[0];
  el.pageSubtitle.textContent = opts.subtitle || title[1];

  try {
    switch (view) {
      case 'dashboard':
        await renderDashboard(content);
        break;
      case 'tickets':
        await renderTickets(content);
        break;
      case 'ticket-new':
        await renderTicketForm(content);
        break;
      case 'sla':
        await renderSla(content);
        break;
      case 'master':
        currentResource = opts.resource;
        await renderMaster(content, opts.resource);
        break;
      case 'ticket':
        await renderTickets(content);
        await showTicket(opts.id);
        break;
      default:
        content.innerHTML = '<div class="empty">Halaman tidak ditemukan</div>';
    }
    currentView = view;
  } catch (err) {
    if (err.status === 401) {
      session.clear();
      el.appShell.hidden = true;
      el.loginScreen.hidden = false;
      return;
    }
    content.innerHTML = `<div class="card"><div class="form-error">${esc(err.message)}</div></div>`;
  }
}

// ---------------------------------------------------------------------------
// Global events
// ---------------------------------------------------------------------------

el.loginForm.addEventListener('submit', handleLogin);
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('refreshBtn').addEventListener('click', () => {
  checkHealth();
  navigate(currentView || 'dashboard', { resource: currentResource });
});
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalBackdrop').addEventListener('click', (e) => {
  if (e.target.id === 'modalBackdrop') closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('modalBackdrop').hidden) closeModal();
});

el.nav.addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item');
  if (!btn) return;
  const view = btn.dataset.view;
  const resource = btn.dataset.resource;
  if (view === 'master') {
    currentResource = resource;
    navigate('master', { resource });
  } else {
    navigate(view);
  }
});

// Ticket number links anywhere in the content area
el.content.addEventListener('click', (e) => {
  const link = e.target.closest('[data-ticket]');
  if (!link) return;
  e.preventDefault();
  showTicket(link.dataset.ticket);
});

// Navigate events emitted by child views
window.addEventListener('synoc:navigate', (e) => {
  const { view, id, resource } = e.detail || {};
  if (view === 'ticket' && id) {
    navigate('tickets');
    showTicket(id);
  } else if (view === 'master' && resource) {
    currentResource = resource;
    navigate('master', { resource });
  } else {
    navigate(view || 'dashboard');
  }
});

window.addEventListener('synoc:refresh', () => {
  if (currentView === 'dashboard') navigate('dashboard');
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

(async function boot() {
  if (session.token) {
    try {
      const { data } = await api.me();
      session.set(session.token, {
        id: data.id, username: data.username, full_name: data.full_name,
        email: data.email, role: data.role, department: data.department,
      });
      await enterApp();
      return;
    } catch {
      session.clear();
    }
  }
  el.loginScreen.hidden = false;
  el.appShell.hidden = true;
})();
