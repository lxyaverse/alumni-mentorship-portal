// Client: talks to the REST API in ../server.js. All business rules are enforced server-side.
const $ = s => document.querySelector(s), esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = t => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
let tok = localStorage.getItem('amp-token'), user = null, tab = '', q = { s: '', d: '', a: '', o: 'rating' }, timer;
const toast = m => { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 2800); };
async function api(m, p, b) {
  const r = await fetch('/api' + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: b ? JSON.stringify(b) : undefined });
  const j = await r.json().catch(() => ({})); if (r.status === 401 && tok) { logout(); throw new Error('session'); }
  if (!r.ok) { toast(j.error || 'Error'); throw new Error(j.error); } return j;
}
const act = async (m, p, b, msg) => { try { await api(m, p, b); if (msg) toast(msg); render(); } catch (e) {} };
const val = id => document.getElementById(id)?.value?.trim();
async function login(email, password) { try { const j = await api('POST', '/login', { email, password }); tok = j.token; localStorage.setItem('amp-token', tok); tab = ''; render(); } catch (e) {} }
function logout() { tok = null; user = null; localStorage.removeItem('amp-token'); render(); }
async function register() { try { await api('POST', '/register', { name: val('rn'), email: val('re'), password: val('rp'), role: val('rr'), grad: +val('rg') || null, degree: val('rd'), org: val('ro') }); toast('Registered. Alumni accounts await coordinator verification.'); } catch (e) {} }
const go = t => { tab = t; render(); };
const withdraw = id => act('POST', `/requests/${id}/withdraw`);
const respond = (id, action) => { let reason; if (action === 'decline' && !(reason = prompt('Reason for declining (required):'))) return toast('A reason is required.'); act('POST', `/requests/${id}/respond`, { action, reason }); };
const schedule = rid => act('POST', '/sessions', { rid, date: val('sd' + rid), time: val('st' + rid), dur: +val('su' + rid), link: val('sl' + rid) }, 'Session scheduled.');
const complete = id => act('POST', `/sessions/${id}/complete`), ff = id => act('POST', `/sessions/${id}/fastforward`);
const cancel = id => { const reason = prompt('Cancellation reason (required):'); if (reason) act('POST', `/sessions/${id}/cancel`, { reason }); };
const feedback = sid => act('POST', '/feedback', { sid, rating: +val('fr' + sid) || 0, comment: val('fc' + sid) }, 'Thanks for your feedback!');
const verify = (id, ok) => { const reason = ok ? '' : prompt('Reason for rejection:'); if (ok || reason) act('POST', `/verifications/${id}`, { ok, reason }); };
const reassign = id => act('POST', `/requests/${id}/reassign`, { mid: val('ra' + id) }, 'Reassigned.');
const toggleU = id => act('POST', `/users/${id}/toggle`);
async function sendReq(mid) { try { await api('POST', '/requests', { mid, topic: val('qt'), msg: val('qm'), slot: val('qs') }); toast('Request sent!'); go('myreq'); } catch (e) {} }
async function saveProfile() { const g = id => val(id); await act('PUT', '/profile', { designation: g('pd'), org: g('po'), industry: g('pi'), domain: g('pm'), expertise: g('pe'), years: g('py'), grad: g('pg'), intro: g('pn'), avail: g('pa'), cap: g('pc') }, 'Profile saved.'); }

async function vMentors() {
  const [cats, l] = await Promise.all([api('GET', '/cats'), api('GET', '/mentors?' + new URLSearchParams(q))]);
  return `<div class="card row"><input placeholder="Search domain, org, skills…" value="${esc(q.s)}" oninput="q.s=this.value;clearTimeout(timer);timer=setTimeout(render,300)">
  <select onchange="q.d=this.value;render()"><option value="">All domains</option>${cats.map(c => `<option ${q.d === c ? 'selected' : ''}>${esc(c)}</option>`)}</select>
  <select onchange="q.a=this.value;render()"><option value="">Any availability</option>${['Available', 'Limited'].map(c => `<option ${q.a === c ? 'selected' : ''}>${c}</option>`)}</select>
  <select onchange="q.o=this.value;render()"><option value="rating">Sort: rating</option><option value="years" ${q.o === 'years' ? 'selected' : ''}>Sort: experience</option><option value="avail" ${q.o === 'avail' ? 'selected' : ''}>Sort: availability</option></select></div>
  ${l.length ? `<div class="g">${l.map(p => `<div class="card"><b>${esc(p.name)}</b> <span class="tag s-${p.avail}">${p.avail}</span><div class="mu">${esc(p.designation)} @ ${esc(p.org)} · ${p.years} yrs · batch ${p.grad}</div>
  <p>${esc(p.intro)}</p><span class="tag">${esc(p.domain)}</span><span class="tag">${esc(p.expertise)}</span><div class="mu">★ ${p.rating ?? 'not enough ratings'} · slots ${p.taken}/${p.cap}</div><br>
  <button class="p" onclick="reqForm('${p.uid}','${esc(p.name)}')">Request mentorship</button></div>`).join('')}</div>` : '<div class="card mu">No mentors match your search/filter. Try clearing filters.</div>'}`;
}
function reqForm(mid, name) { $('#app').innerHTML = `<div class="card"><h3>Request mentorship from ${esc(name)}</h3><label>Topic</label><input id="qt"><label>Message (your goal)</label><textarea id="qm" rows="3"></textarea>
  <label>Preferred time slot</label><input id="qs" placeholder="e.g. Sat 6 PM IST"><br><br><button class="p" onclick="sendReq('${mid}')">Submit</button> <button onclick="render()">Back</button></div>`; }
async function vReqs() {
  const stu = user.role === 'student', l = await api('GET', '/requests');
  return l.length ? l.map(r => `<div class="card"><div class="row"><b>${esc(r.topic)}</b><span class="tag s-${r.status}">${r.status}</span><span class="mu">${stu ? 'to' : 'from'} ${esc(r.other)} · ${fmt(r.created)}</span></div>
  <p>${esc(r.msg)}</p><div class="mu">Slot: ${esc(r.slot)}${r.reason ? ' · Decline reason: ' + esc(r.reason) : ''}</div>
  ${stu && r.status === 'Pending' ? `<button class="d" onclick="withdraw('${r.id}')">Withdraw</button>` : ''}
  ${!stu && r.status === 'Pending' ? `<button class="p" onclick="respond('${r.id}','accept')">Accept</button> <button class="d" onclick="respond('${r.id}','decline')">Decline</button> <button onclick="respond('${r.id}','refer')">Refer</button>` : ''}
  ${!stu && r.status === 'Accepted' && !r.sessions ? `<hr><div class="row"><input type="date" id="sd${r.id}"><input type="time" id="st${r.id}"><select id="su${r.id}"><option>30</option><option>45</option><option>60</option></select><input id="sl${r.id}" placeholder="https://meet.google.com/…"><button class="p" onclick="schedule('${r.id}')">Schedule</button></div>` : ''}</div>`).join('') : '<div class="card mu">Nothing here yet.</div>';
}
async function vSessions() {
  const stu = user.role === 'student', l = await api('GET', '/sessions');
  return l.length ? l.map(s => `<div class="card"><div class="row"><b>${esc(s.topic)}</b><span class="tag s-${s.status}">${s.status}</span><span class="mu">with ${esc(s.other)}</span></div>
  <div class="mu">${s.date} ${s.time} · ${s.dur} min · <a href="${esc(s.link)}" target="_blank" rel="noopener">meeting link</a></div>
  ${s.status === 'Scheduled' ? `<button class="d" onclick="cancel('${s.id}')">Cancel</button> ${!stu ? `<button class="p" onclick="complete('${s.id}')">Mark completed</button> <button onclick="ff('${s.id}')" title="DEMO=1 only">⏩ fast-forward</button>` : ''}` : ''}
  ${stu && s.status === 'Completed' ? (s.feedback ? `<div class="mu">You rated this ${s.feedback.rating}/5 ✔</div>` : `<div class="row"><select id="fr${s.id}"><option value="">Rating</option>${[1, 2, 3, 4, 5].map(n => `<option>${n}</option>`)}</select><input id="fc${s.id}" placeholder="Comments (optional)"><button class="p" onclick="feedback('${s.id}')">Submit</button></div>`) : ''}
  ${!stu && s.feedback ? `<div class="mu">Feedback: ${s.feedback.rating}/5 — ${esc(s.feedback.comment || 'no comment')}</div>` : ''}</div>`).join('') : '<div class="card mu">No sessions yet.</div>';
}
async function vProfile() {
  if (user.status !== 'verified') return `<div class="card">Your account is <b class="s-${user.status}">${user.status}</b>. ${user.status === 'pending' ? 'A coordinator must verify you before you can create a profile.' : esc(user.why || '')}</div>`;
  const [p0, cats] = await Promise.all([api('GET', '/profile'), api('GET', '/cats')]), p = { avail: 'Available', cap: 3, ...p0 }, f = (id, l, v, t = 'text') => `<label>${l}</label><input id="${id}" type="${t}" value="${esc(v ?? '')}">`;
  return `<div class="card">${f('pd', 'Designation', p.designation)}${f('po', 'Organization', p.org)}${f('pi', 'Industry', p.industry)}<label>Domain</label><select id="pm">${cats.map(c => `<option ${p.domain === c ? 'selected' : ''}>${esc(c)}</option>`)}</select>
  ${f('pe', 'Areas of expertise', p.expertise)}${f('py', 'Years of experience', p.years, 'number')}${f('pg', 'Graduation year', p.grad, 'number')}<label>Introduction</label><textarea id="pn">${esc(p.intro || '')}</textarea>
  <label>Availability</label><select id="pa">${['Available', 'Limited', 'Unavailable'].map(c => `<option ${p.avail === c ? 'selected' : ''}>${c}</option>`)}</select>${f('pc', 'Mentoring capacity', p.cap, 'number')}<br><button class="p" onclick="saveProfile()">Save profile</button></div>`;
}
async function vNotes() { const l = await api('GET', '/notifications'); return l.length ? l.map(n => `<div class="card"><span class="tag">${n.read ? 'read' : 'new'}</span>${esc(n.msg)} <span class="mu">${fmt(n.t)}</span></div>`).join('') : '<div class="card mu">No notifications.</div>'; }
async function vCoord() {
  const [pend, rr, ms] = await Promise.all([api('GET', '/verifications'), api('GET', '/requests/referred'), api('GET', '/mentors')]);
  return `<h3>Verification queue</h3>${pend.length ? pend.map(u => `<div class="card row"><b>${esc(u.name)}</b><span class="mu">${esc(u.email)} · ${esc(u.degree || '')} ${u.grad || ''} · ${esc(u.org || '')}</span><button class="p" onclick="verify('${u.id}',true)">Verify</button><button class="d" onclick="verify('${u.id}',false)">Reject</button></div>`).join('') : '<div class="card mu">Queue empty.</div>'}
  <h3>Referred / expired requests</h3>${rr.length ? rr.map(r => `<div class="card row"><b>${esc(r.topic)}</b><span class="tag s-${r.status}">${r.status}</span><span class="mu">${esc(r.student)}</span>${user.role === 'coordinator' ? `<select id="ra${r.id}">${ms.map(m => `<option value="${m.uid}">${esc(m.name)}</option>`)}</select><button class="p" onclick="reassign('${r.id}')">Reassign</button>` : ''}</div>`).join('') : '<div class="card mu">None.</div>'}`;
}
async function vAdmin() {
  const [s, us, au] = await Promise.all([api('GET', '/stats'), api('GET', '/users'), api('GET', '/audit')]);
  const st = [['Students', s.students], ['Verified mentors', s.mentors], ['Pending requests', s.pending], ['Accepted', s.accepted], ['Scheduled', s.scheduled], ['Completed', s.completed], ['Avg rating', s.avgRating ?? '–']];
  return `<div class="g">${st.map(([k, v]) => `<div class="card"><div class="stat">${v}</div><div class="mu">${k}</div></div>`).join('')}</div>` + (user.role === 'admin' ?
  `<h3>Users</h3><div class="card"><table>${us.map(u => `<tr><td>${esc(u.name)}</td><td>${u.role}</td><td class="${u.active ? 's-Available' : 's-Declined'}">${u.active ? 'active' : 'deactivated'}</td><td>${u.id !== user.id ? `<button onclick="toggleU('${u.id}')">${u.active ? 'Deactivate' : 'Reactivate'}</button>` : ''}</td></tr>`).join('')}</table></div>
  <h3>Audit log</h3><div class="card">${au.length ? au.map(l => `<div class="mu">${fmt(l.t)} — ${esc(l.actor)}: ${esc(l.action)}</div>`).join('') : '<span class="mu">No actions yet.</span>'}</div>` : '');
}
function vAuth() {
  return `<section class="hero"><div><div class="eyebrow">Connect • Learn • Grow</div><h1>Your next <span>mentor</span> is closer than you think.</h1><p>A focused space for LNMIIT students and alumni to find guidance, share experience, and build meaningful connections.</p><div class="row"><span class="tag">Verified alumni</span><span class="tag">Structured sessions</span><span class="tag">Real progress</span></div></div><div class="hero-art"><div class="eyebrow" style="color:#b9f1e9">MENTORSHIP, MADE SIMPLE</div><div class="orbit-card"><b>One conversation can change your direction.</b><div class="mu" style="color:#d9f3f0;margin-top:5px">Discover the right people for your goals.</div></div></div></section><div class="auth-grid"><div class="card"><h3>Welcome back</h3><p class="mu">Sign in to continue your mentorship journey.</p><label>Email</label><input id="le" placeholder="you@example.com"><label>Password</label><input id="lp" type="password" placeholder="••••••••"><br><br><button class="p" onclick="login(val('le'),val('lp'))">Log in</button>
  <p class="mu">Seeded demo accounts (password <b>demo123</b>):</p><div class="row">${[['Student', 'student@demo.com'], ['Mentor', 'mentor@demo.com'], ['Coordinator', 'coord@demo.com'], ['Admin', 'admin@demo.com']].map(([n, e]) => `<button onclick="login('${e}','demo123')">${n}</button>`).join('')}</div></div>
  <div class="card"><h3>Join the community</h3><p class="mu">Create an account and start building your network.</p><label>Full name</label><input id="rn" placeholder="Your full name"><label>Email</label><input id="re" placeholder="you@example.com"><label>Password (min 6)</label><input id="rp" type="password"><label>Role</label><select id="rr"><option value="student">Student</option><option value="alumnus">Alumnus</option></select>
  <label>Alumni only: graduation year / degree / organization</label><div class="row"><input id="rg" type="number" placeholder="2020"><input id="rd" placeholder="B.Tech CSE"><input id="ro" placeholder="Company"></div><br><button onclick="register()">Create account</button></div></div>`;
}
const TABS = {
  student: [['mentors', 'Find mentors', vMentors], ['myreq', 'My requests', vReqs], ['sess', 'Sessions', vSessions], ['notes', 'Notifications', vNotes]],
  alumnus: [['inbox', 'Request inbox', vReqs], ['sess', 'Sessions', vSessions], ['prof', 'My profile', vProfile], ['notes', 'Notifications', vNotes]],
  coordinator: [['c', 'Verification & reassignment', vCoord], ['d', 'Dashboard', vAdmin]], admin: [['d', 'Dashboard & users', vAdmin], ['c', 'Verification', vCoord]] };
async function render() {
  if (!tok) { $('#who').innerHTML = ''; $('#app').innerHTML = vAuth(); return; }
  try {
    user = await api('GET', '/me'); const T = TABS[user.role]; if (!T.some(t => t[0] === tab)) tab = T[0][0];
    const n = (await api('GET', '/notifications/count')).unread; $('#who').innerHTML = `${esc(user.name)} <span class="tag">${user.role}</span><span class="tag">🔔 ${n}</span><button onclick="logout()">Log out</button>`;
    const current = T.find(t => t[0] === tab), html = await current[2]();
    const headings = { mentors: ['Find your mentor', 'Explore alumni who are ready to help you move forward.'], myreq: ['Your mentorship requests', 'Keep track of conversations and next steps.'], sess: ['Your sessions', 'Everything you need for a focused mentorship conversation.'], notes: ['Notifications', 'Stay up to date with your mentorship journey.'], inbox: ['Request inbox', 'Review incoming student requests and create meaningful matches.'], prof: ['Your mentor profile', 'Tell students how your experience can help them.'], c: ['Coordination centre', 'Keep verification and reassignment moving smoothly.'], d: ['Activity dashboard', 'A clear view of mentorship activity across the portal.'] };
    const heading = headings[tab] || [current[1], ''];
    $('#app').innerHTML = `<nav>${T.map(t => `<button class="${t[0] === tab ? 'on' : ''}" onclick="go('${t[0]}')">${t[1]}</button>`).join('')}</nav><div class="page-heading"><div class="eyebrow">${esc(user.role)} workspace</div><h2>${heading[0]}</h2><p class="mu">${heading[1]}</p></div>${html}`;
  } catch (e) { if (e.message !== 'session') console.error(e); }
}
render();
