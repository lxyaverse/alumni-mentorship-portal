// Client: talks to the REST API in ../server.js. All business rules are enforced server-side.
const $ = s => document.querySelector(s), esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = t => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
let tok = localStorage.getItem('amp-token'), user = null, tab = '', q = { s: '', d: '', a: '', o: 'rating' }, timer;
window.tok = tok;
window.user = null;

const toast = m => {
  const t = $('#toast');
  if (t) {
    t.textContent = m;
    t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', 2800);
  }
};
window.toast = toast;

async function api(m, p, b) {
  const r = await fetch('/api' + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: b ? JSON.stringify(b) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && tok) { logout(); throw new Error('session'); }
  if (!r.ok) { toast(j.error || 'Error'); throw new Error(j.error); }
  return j;
}

const act = async (m, p, b, msg) => {
  try {
    await api(m, p, b);
    if (msg) toast(msg);
    render();
  } catch (e) {}
};

const val = id => document.getElementById(id)?.value?.trim();

async function login(email, password) {
  try {
    const j = await api('POST', '/login', { email, password });
    tok = j.token;
    localStorage.setItem('amp-token', tok);
    window.tok = tok;
    tab = '';
    render();
  } catch (e) {}
}

function logout() {
  tok = null;
  user = null;
  window.tok = null;
  window.user = null;
  localStorage.removeItem('amp-token');
  render();
}

async function register() {
  try {
    await api('POST', '/register', {
      name: val('rn'),
      email: val('re'),
      password: val('rp'),
      role: val('rr'),
      grad: +val('rg') || null,
      degree: val('rd'),
      org: val('ro')
    });
    toast('Registered! Alumni accounts await coordinator verification.');
  } catch (e) {}
}

async function forgotPassword() {
  const email = prompt('Enter your account email');
  if (!email) return;
  try {
    const data = await api('POST', '/forgot-password', { email });
    if (!data.demoToken) {
      toast(data.message);
      return;
    }
    const password = prompt('Enter your new password (minimum 6 characters)');
    if (!password) return;
    await api('POST', '/reset-password', { token: data.demoToken, password });
    toast('Password updated successfully.');
  } catch (e) {}
}

async function openAccountSettings() {
  try {
    const account = await api('GET', '/account');
    const name = prompt('Name', account.name);
    if (!name) return;
    if (name !== account.name) {
      await api('PATCH', '/account', { name });
      user = { ...user, name };
      window.user = user;
      toast('Account name updated.');
      render();
    }
  } catch (e) {}

  const changePassword = confirm('Change your password too?');
  if (!changePassword) return;
  const currentPassword = prompt('Enter your current password');
  const newPassword = prompt('Enter your new password');
  if (!currentPassword || !newPassword) return;
  try {
    await api('POST', '/account/password', { currentPassword, newPassword });
    toast('Password changed successfully.');
  } catch (e) {}
}

const go = t => {
  tab = t;
  render();
};
window.go = go;

async function openNotifications() {
  try {
    await api('GET', '/notifications');
  } catch (e) {}
  tab = 'notes';
  render();
}
window.openNotifications = openNotifications;

// Action handlers
const withdraw = id => act('POST', `/requests/${id}/withdraw`, null, 'Request withdrawn.');
const respond = (id, action) => {
  let reason;
  if (action === 'decline' && !(reason = prompt('Reason for declining (required):'))) {
    return toast('A reason is required when declining.');
  }
  act('POST', `/requests/${id}/respond`, { action, reason }, `Request ${action}ed.`);
};
const schedule = rid => act('POST', '/sessions', {
  rid,
  date: val('sd' + rid),
  time: val('st' + rid),
  dur: +val('su' + rid),
  link: val('sl' + rid)
}, 'Session scheduled.');
const complete = id => act('POST', `/sessions/${id}/complete`, null, 'Session marked complete.');
const ff = id => act('POST', `/sessions/${id}/fastforward`, null, 'Fast-forwarded session date/time.');
const cancel = id => {
  const reason = prompt('Cancellation reason (required):');
  if (reason) act('POST', `/sessions/${id}/cancel`, { reason }, 'Session cancelled.');
};
const feedback = sid => act('POST', '/feedback', {
  sid,
  rating: +val('fr' + sid) || 0,
  comment: val('fc' + sid)
}, 'Thanks for your feedback!');
const verify = (id, ok) => {
  const reason = ok ? '' : prompt('Reason for rejection (required):');
  if (ok || reason) act('POST', `/verifications/${id}`, { ok, reason }, ok ? 'Alumnus verified.' : 'Alumnus rejected.');
};
const reassign = id => act('POST', `/requests/${id}/reassign`, { mid: val('ra' + id) }, 'Request reassigned.');
const toggleU = id => act('POST', `/users/${id}/toggle`, null, 'User status updated.');
const changeRole = (id, role) => act('POST', `/users/${id}/role`, { role }, 'Role updated.');
const addCat = () => { const n = val('new-cat'); if (n) act('POST', '/categories', { name: n }, 'Category added.'); };
const delCat = name => act('DELETE', `/categories/${encodeURIComponent(name)}`, null, 'Category deleted.');
const resetDemo = () => { if (confirm('Reset all demo data?')) act('POST', '/demo/reset', null, 'Demo data reset successfully.'); };

async function sendReq(mid) {
  try {
    await api('POST', '/requests', {
      mid,
      topic: val('qt'),
      msg: val('qm'),
      slot: val('qs'),
      domain: val('qd')
    });
    toast('Mentorship request sent successfully!');
    go('myreq');
  } catch (e) {}
}

async function saveProfile() {
  const g = id => val(id);
  await act('PUT', '/profile', {
    designation: g('pd'),
    org: g('po'),
    industry: g('pi'),
    domain: g('pm'),
    expertise: g('pe'),
    years: g('py'),
    grad: g('pg'),
    intro: g('pn'),
    avail: g('pa'),
    cap: g('pc')
  }, 'Mentor profile saved.');
}

window.$ = $;
window.esc = esc;
window.fmt = fmt;
window.q = q;
window.api = api;
window.act = act;
window.val = val;
window.login = login;
window.logout = logout;
window.register = register;
window.forgotPassword = forgotPassword;
window.openAccountSettings = openAccountSettings;
window.go = go;
window.openNotifications = openNotifications;
window.withdraw = withdraw;
window.respond = respond;
window.schedule = schedule;
window.complete = complete;
window.ff = ff;
window.cancel = cancel;
window.feedback = feedback;
window.verify = verify;
window.reassign = reassign;
window.toggleU = toggleU;
window.changeRole = changeRole;
window.addCat = addCat;
window.delCat = delCat;
window.resetDemo = resetDemo;
window.sendReq = sendReq;
window.saveProfile = saveProfile;

// -------------------------------------------------------------
// VIEWS WITH DATA-SCREEN & DATA-TRACE ATTRIBUTES
// -------------------------------------------------------------

// Student: Find Mentors (WF-01)
