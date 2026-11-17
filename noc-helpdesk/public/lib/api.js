/**
 * SYNOC — API client.
 * Wraps fetch with token handling and normalized errors.
 */

const TOKEN_KEY = 'synoc.token';
const USER_KEY = 'synoc.user';

/**
 * Mount prefix, derived from this module's own location.
 * `/lib/api.js`         -> ''          (standalone dev server, API at /api)
 * `/helpdesk/lib/api.js` -> '/helpdesk' (gateway mount, API at /helpdesk/api)
 *
 * API paths below are absolute (`/api/...`), so the prefix is prepended.
 */
const API_BASE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

export const session = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  get user() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
    catch { return null; }
  },
  set(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, params } = {}) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }

  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session.token) headers['Authorization'] = `Bearer ${session.token}`;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Tidak dapat terhubung ke server', 0);
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = { raw: text }; }
  }

  if (!res.ok) {
    if (res.status === 401) session.clear();
    throw new ApiError(data?.error || `HTTP ${res.status}`, res.status);
  }
  return data;
}

export const api = {
  ApiError,

  // --- auth ---
  login: (username, password) => request('/api/auth/login', { method: 'POST', body: { username, password } }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/auth/me'),
  users: (activeOnly) => request('/api/auth/users', { params: { active_only: activeOnly ? 1 : '' } }),
  createUser: (payload) => request('/api/auth/users', { method: 'POST', body: payload }),

  // --- health ---
  health: () => request('/api/health'),

  // --- tickets ---
  dashboard: () => request('/api/tickets/dashboard/summary'),
  tickets: (params) => request('/api/tickets', { params }),
  ticket: (id) => request(`/api/tickets/${id}`),
  createTicket: (payload) => request('/api/tickets', { method: 'POST', body: payload }),
  updateTicket: (id, payload) => request(`/api/tickets/${id}`, { method: 'PUT', body: payload }),
  setStatus: (id, status, note) => request(`/api/tickets/${id}/status`, { method: 'POST', body: { status, note } }),
  assign: (id, assignedTo) => request(`/api/tickets/${id}/assign`, { method: 'POST', body: { assigned_to: assignedTo } }),
  addEvent: (id, note, type) => request(`/api/tickets/${id}/events`, { method: 'POST', body: { note, event_type: type } }),
  deleteTicket: (id) => request(`/api/tickets/${id}`, { method: 'DELETE' }),

  // --- SLA ---
  slaPolicies: (serviceTypeId) => request('/api/tickets/sla/policies', { params: { service_type_id: serviceTypeId } }),
  slaPreview: (serviceTypeId, priorityId) =>
    request('/api/tickets/sla/preview', { params: { service_type_id: serviceTypeId, priority_id: priorityId } }),

  // --- master data ---
  masterList: (resource) => request(`/api/master/${resource}`),
  masterOptions: (resource) => request(`/api/master/${resource}/options`),
  masterItem: (resource, id) => request(`/api/master/${resource}/${id}`),
  masterCreate: (resource, payload) => request(`/api/master/${resource}`, { method: 'POST', body: payload }),
  masterUpdate: (resource, id, payload) => request(`/api/master/${resource}/${id}`, { method: 'PUT', body: payload }),
  masterDelete: (resource, id) => request(`/api/master/${resource}/${id}`, { method: 'DELETE' }),
};
