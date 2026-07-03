// ===== CRAMBRUNCH SHARED UTILITIES =====
const API = '/api';

function getToken() { return localStorage.getItem('cb_token'); }
function getUser() { const u = localStorage.getItem('cb_user'); return u ? JSON.parse(u) : null; }

async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  return res.json();
}

function logout() {
  localStorage.removeItem('cb_token');
  localStorage.removeItem('cb_user');
  window.location.href = '/';
}

function requireAuth(allowedRoles) {
  const user = getUser();
  const token = getToken();
  if (!token || !user) { window.location.href = '/'; return null; }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    window.location.href = '/';
    return null;
  }
  return user;
}

function initUserUI(user) {
  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);
  document.querySelectorAll('.user-avatar').forEach(el => el.textContent = initials);
  document.querySelectorAll('.user-name').forEach(el => el.textContent = user.name);
  document.querySelectorAll('.user-role').forEach(el => el.textContent = user.role.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase()));
  document.querySelectorAll('[data-logout]').forEach(el => el.addEventListener('click', logout));
}

function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const view = document.getElementById(viewId);
  if (view) view.classList.add('active');
  const navItem = document.querySelector(`[data-view="${viewId}"]`);
  if (navItem) navItem.classList.add('active');
  // Update page title
  const title = navItem ? navItem.querySelector('.label')?.textContent || navItem.textContent.trim() : '';
  const pt = document.querySelector('.page-title');
  if (pt) pt.textContent = title;
}

async function loadNotifications() {
  try {
    const data = await apiFetch('/notifications');
    if (!data.success) return;
    const unread = data.data.filter(n => !n.isRead).length;
    const dot = document.querySelector('.notif-dot');
    if (dot) { dot.textContent = unread > 0 ? unread : ''; dot.style.display = unread > 0 ? 'flex' : 'none'; }
    const list = document.querySelector('.notif-list');
    if (!list) return;
    list.innerHTML = data.data.length === 0
      ? '<div class="empty-state"><div class="icon">🔔</div><p>No notifications</p></div>'
      : data.data.map(n => `
        <div class="notif-item ${n.isRead ? '' : 'unread'}" onclick="markNotifRead('${n._id}',this)">
          <div class="n-title">${n.title}</div>
          <div class="n-msg">${n.message}</div>
          <div class="n-time">${timeAgo(n.createdAt)}</div>
        </div>`).join('');
  } catch(e) { console.log('Notifications offline'); }
}

async function markNotifRead(id, el) {
  await apiFetch(`/notifications/${id}/read`, { method: 'PUT' });
  el.classList.remove('unread');
  loadNotifications();
}

function toggleNotifPanel() {
  document.querySelector('.notif-panel').classList.toggle('open');
}

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

function showToast(msg, type = 'success') {
  const toast = document.createElement('div');
  toast.style.cssText = `position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;padding:.85rem 1.5rem;border-radius:10px;font-family:var(--font-body);font-size:.875rem;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,.4);animation:slideUp .3s ease;max-width:320px;`;
  toast.style.background = type === 'success' ? 'rgba(0,200,150,.15)' : type === 'error' ? 'rgba(239,68,68,.15)' : 'rgba(0,229,255,.1)';
  toast.style.border = `1px solid ${type==='success'?'rgba(0,200,150,.4)':type==='error'?'rgba(239,68,68,.4)':'rgba(0,229,255,.3)'}`;
  toast.style.color = type === 'success' ? '#00c896' : type === 'error' ? '#ef4444' : '#00e5ff';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}

function pctClass(p) { return p >= 75 ? 'good' : p >= 60 ? 'warn' : 'bad'; }

// Mobile sidebar toggle
document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.querySelector('.sidebar-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      document.querySelector('.sidebar').classList.toggle('mobile-open');
    });
  }
});
