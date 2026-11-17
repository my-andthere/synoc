/* synoc — live dashboard
 * Zero dependencies. Fetches repo metadata from the public GitHub API.
 * Falls back to a cached snapshot when the API is rate-limited or offline.
 */

const OWNER = 'my-andthere';
const REPO = 'synoc';
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const CACHE_KEY = 'synoc:snapshot:v1';

const $ = (id) => document.getElementById(id);

/**
 * Deployment root of this page, always ending in '/'.
 * Works both when served from the gateway root ('/') and from a
 * project sub-path such as GitHub Pages ('/synoc/').
 */
const BASE = (() => {
  let p = location.pathname;
  if (!p.endsWith('/')) p = p.slice(0, p.lastIndexOf('/') + 1);
  return p;
})();

/** Public entry points of the SYNOC applications. */
const HELPDESK_URL = `${BASE}helpdesk/`;
const API_HEALTH_URL = `${BASE}api/health`;

/** Point every application link at the right place. */
function wireAppLinks() {
  for (const id of ['liveUrl', 'helpdeskLink']) {
    const el = $(id);
    if (el) el.href = HELPDESK_URL;
  }
  for (const id of ['apiUrl', 'apiLink']) {
    const el = $(id);
    if (el) el.href = API_HEALTH_URL;
  }
}

/**
 * Probe the helpdesk backend so the page can report whether the API and
 * database are reachable. On a static-only deployment (e.g. GitHub Pages)
 * there is no backend, and we say so instead of showing a false error.
 */
async function probeServices() {
  const svc = $('svcPill');
  const db = $('dbPill');
  if (!svc || !db) return;

  svc.textContent = 'checking…';
  db.textContent = 'checking…';

  try {
    const res = await fetch(API_HEALTH_URL, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    svc.textContent = 'connected';
    db.textContent = data.db?.connected
      ? `MySQL ${String(data.db.version).split(' ')[0]}`
      : 'db offline';
  } catch {
    svc.textContent = 'static build';
    db.textContent = 'no backend';
  }
}

function relative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const units = [
    ['y', 31536e6], ['mo', 2592e6], ['d', 864e5],
    ['h', 36e5], ['m', 6e4], ['s', 1000],
  ];
  for (const [label, ms] of units) {
    const n = Math.floor(diff / ms);
    if (n >= 1) return `${n}${label} ago`;
  }
  return 'just now';
}

function stamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

function setStatus(state, text) {
  const el = $('status');
  el.dataset.state = state;
  $('statusText').textContent = text;
}

function paintRepo(data, source) {
  $('repoName').textContent = data.full_name;
  $('repoPrivate').textContent = data.private ? 'private' : 'public';
  $('repoStars').textContent = data.stargazers_count;
  $('repoForks').textContent = data.forks_count;
  $('repoBranch').textContent = data.default_branch;
  $('repoPush').textContent = relative(data.pushed_at);

  $('repoUrl').href = data.html_url;

  $('apiPill').textContent = source;
  $('protocol').textContent = location.protocol.replace(':', '') || '—';
  $('origin').textContent = location.origin || '—';
  $('ua').textContent = navigator.userAgent.slice(0, 48) + (navigator.userAgent.length > 48 ? '…' : '');
  $('renderedAt').textContent = stamp(new Date().toISOString());
}

function paintCommits(list) {
  const ul = $('commits');
  ul.innerHTML = '';
  if (!list.length) {
    ul.innerHTML = '<li class="error-box">Tidak ada commit yang bisa dibaca.</li>';
    return;
  }
  for (const c of list) {
    const li = document.createElement('li');

    const sha = document.createElement('code');
    sha.className = 'sha';
    sha.textContent = c.sha.slice(0, 7);

    const msg = document.createElement('span');
    msg.className = 'msg';
    msg.textContent = c.commit.message.split('\n')[0];

    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = `${c.commit.author?.name ?? 'unknown'} · ${relative(c.commit.author?.date)}`;

    li.append(sha, msg, meta);
    ul.append(li);
  }
  $('commitCount').textContent = `${list.length} recent`;
}

function paintError(message) {
  $('commits').innerHTML = `<li class="error-box">${message}</li>`;
  setStatus('error', 'degraded');
}

function saveSnapshot(repo, commits) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ repo, commits, at: Date.now() }));
  } catch { /* storage disabled — fine */ }
}

function loadSnapshot() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.repo ? parsed : null;
  } catch {
    return null;
  }
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    const hint = res.status === 403 && remaining === '0'
      ? ' GitHub API rate limit tercapai — data cached yang ditampilkan.'
      : '';
    throw new Error(`HTTP ${res.status} ${res.statusText}.${hint}`);
  }
  return res.json();
}

async function load() {
  setStatus('loading', 'connecting…');
  $('refresh').disabled = true;

  try {
    const [repo, commits] = await Promise.all([
      getJSON(API),
      getJSON(`${API}/commits?per_page=5`),
    ]);
    paintRepo(repo, 'live');
    paintCommits(commits);
    saveSnapshot(repo, commits);
    setStatus('ok', 'live · online');
  } catch (err) {
    const snap = loadSnapshot();
    if (snap) {
      paintRepo(snap.repo, 'cached');
      paintCommits(snap.commits);
      setStatus('error', `offline · cache ${relative(new Date(snap.at).toISOString())}`);
    } else {
      paintError(
        `Gagal memuat data: ${err.message}<br>Halaman tetap online — data live tidak tersedia saat ini.`
      );
    }
  } finally {
    $('refresh').disabled = false;
  }
}

$('refresh').addEventListener('click', load);
document.addEventListener('DOMContentLoaded', boot);
if (document.readyState !== 'loading') boot();

function boot() {
  wireAppLinks();
  probeServices();
  load();
}
