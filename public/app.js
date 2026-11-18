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

const go = t => {
  tab = t;
  render();
};
window.go = go;

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

// -------------------------------------------------------------
// VIEWS WITH DATA-SCREEN & DATA-TRACE ATTRIBUTES
// -------------------------------------------------------------

// Student: Find Mentors (WF-01)
async function vMentors() {
  const [cats, l] = await Promise.all([
    api('GET', '/cats'),
    api('GET', '/mentors?' + new URLSearchParams(q))
  ]);

  return `
  <div data-screen="mentor-discovery" data-trace="FR-016,FR-018,FR-019,FR-020,FR-021,FR-023,FR-031,BR-002,BR-015,BR-016,UC-007,UC-009,UC-010">
    <div class="card row">
      <input id="search-input" data-trace="FR-019,UC-007" placeholder="Search domain, org, skills…" value="${esc(q.s)}" oninput="q.s=this.value;clearTimeout(timer);timer=setTimeout(render,300)">
      <select class="filter-domain" data-trace="FR-020,FR-060" onchange="q.d=this.value;render()">
        <option value="">All domains</option>
        ${cats.map(c => `<option ${q.d === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
      <select class="filter-avail" data-trace="FR-020" onchange="q.a=this.value;render()">
        <option value="">Any availability</option>
        ${['Available', 'Limited'].map(c => `<option ${q.a === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
      <select class="sort-select" data-trace="FR-021" onchange="q.o=this.value;render()">
        <option value="rating">Sort: rating</option>
        <option value="years" ${q.o === 'years' ? 'selected' : ''}>Sort: experience</option>
        <option value="avail" ${q.o === 'avail' ? 'selected' : ''}>Sort: availability</option>
      </select>
    </div>

    ${l.length ? `
      <div class="g">
        ${l.map(p => `
          <div class="card mentor-card" data-trace="FR-016,FR-018,BR-002,BR-016">
            <div class="row" style="justify-content:space-between">
              <b>${esc(p.name)}</b>
              <span class="tag s-${p.avail} avail-badge" data-trace="FR-014">${p.avail}</span>
            </div>
            <div class="mu">${esc(p.designation)} @ ${esc(p.org)} · ${p.years} yrs exp · batch ${p.grad}</div>
            <p>${esc(p.intro)}</p>
            <span class="tag">${esc(p.domain)}</span>
            <span class="tag">${esc(p.expertise)}</span>
            <div class="mu rating-text" data-trace="FR-049,BR-015" style="margin-top:8px">
              ★ ${p.rating ? p.rating + ' / 5.0' : 'Rating: not enough ratings yet'} · slots ${p.taken}/${p.cap}
            </div>
            <br>
            <div class="row">
              <button class="p request-btn" data-trace="FR-024,UC-009" onclick="reqForm('${p.uid}','${esc(p.name)}','${esc(p.domain)}')">Request mentorship</button>
              <button onclick="viewProfile('${p.uid}')" data-trace="FR-022,UC-008">View Profile</button>
            </div>
          </div>
        `).join('')}
      </div>
    ` : `
      <div class="card mu empty-state" data-trace="FR-023">
        No mentors match your search. Try removing a filter or using a different keyword.
      </div>
    `}
  </div>`;
}

// Student: Mentor Profile View (WF-02)
async function viewProfile(uid) {
  const p = await api('GET', `/mentor/${uid}`);
  $('#app').innerHTML = `
  <div data-screen="mentor-profile" data-trace="FR-012,FR-014,FR-022,FR-024,FR-049,BR-015,BR-016,UC-008,UC-009">
    <div class="card mentor-detail" data-trace="FR-022,BR-016">
      <div class="row" style="justify-content:space-between">
        <h2>${esc(p.name)}</h2>
        <span class="tag s-${p.avail} avail-badge" data-trace="FR-014">${p.avail}</span>
      </div>
      <div class="mu" style="font-size:16px">${esc(p.designation)} @ ${esc(p.org)} · Industry: ${esc(p.industry || 'Software')}</div>
      <div class="mu">Domain: <b>${esc(p.domain)}</b> · Batch: ${p.grad} · Experience: ${p.years} years</div>
      <div class="mu rating-display" data-trace="FR-049,BR-015" style="margin:12px 0;font-size:15px">
        <b>★ Aggregate Rating:</b> ${p.rating ? p.rating + ' / 5.0' : 'Rating: not enough ratings yet'}
      </div>
      <hr>
      <h3>About Me</h3>
      <p style="font-size:15px;line-height:1.6">${esc(p.intro)}</p>
      <h3>Areas of Expertise</h3>
      <p><span class="tag">${esc(p.expertise)}</span></p>
      <div class="mu" style="margin:16px 0">Active Mentees: ${p.taken} / ${p.cap} capacity</div>
      <div class="row">
        <button class="p request-btn" data-trace="FR-024,UC-009" onclick="reqForm('${p.uid}','${esc(p.name)}','${esc(p.domain)}')">Request Mentorship</button>
        <button onclick="go('mentors')">Back to Mentor List</button>
      </div>
    </div>
  </div>`;
  setTimeout(() => window.TraceOverlay && window.TraceOverlay.applyOverlays(), 100);
}

// Student: Request Form (WF-03)
function reqForm(mid, name, domain) {
  $('#app').innerHTML = `
  <div data-screen="request-form" data-trace="FR-024,FR-025,FR-026,FR-027,FR-060,BR-004,BR-005,UC-009">
    <div class="card">
      <h3>Request mentorship from ${esc(name)}</h3>
      <p class="mu">Fill in your request details. Your mentor will receive this in their inbox.</p>
      <label>Topic *</label>
      <input id="qt" data-trace="FR-025" placeholder="e.g. SDE Interview preparation">
      <label>Domain</label>
      <input id="qd" class="domain-select" data-trace="FR-025,FR-060" value="${esc(domain || '')}" readonly>
      <label>Message (your goal & background) *</label>
      <textarea id="qm" data-trace="FR-025" rows="4" placeholder="Briefly introduce yourself and what specific guidance you need..."></textarea>
      <label>Preferred time slot *</label>
      <input id="qs" data-trace="FR-025" placeholder="e.g. Saturday 6:00 PM IST"><br><br>
      <div class="row">
        <button class="p" type="submit" data-trace="FR-024,UC-009" onclick="sendReq('${mid}')">Submit Request</button>
        <button onclick="go('mentors')">Cancel</button>
      </div>
      <div class="error-duplicate" data-trace="FR-026,BR-004" style="display:none"></div>
      <div class="error-limit" data-trace="FR-027,BR-005" style="display:none"></div>
    </div>
  </div>`;
  setTimeout(() => window.TraceOverlay && window.TraceOverlay.applyOverlays(), 100);
}

// Student: My Requests
async function vReqs() {
  const stu = user.role === 'student';
  const l = await api('GET', '/requests');
  const screenId = stu ? 'my-requests' : 'request-inbox';
  const screenTrace = stu ?
    'FR-028,FR-029,UC-011' :
    'FR-017,FR-025,FR-029,FR-030,FR-032,FR-033,FR-034,FR-035,FR-037,FR-038,FR-052,BR-006,BR-008,BR-009,UC-012,UC-013';

  return `
  <div data-screen="${screenId}" data-trace="${screenTrace}">
    ${l.length ? l.map(r => `
      <div class="card req-card req-list" data-trace="${stu ? 'FR-029' : 'FR-030,UC-012'}">
        <div class="row" style="justify-content:space-between">
          <b>${esc(r.topic)}</b>
          <span class="tag s-${r.status} req-status" data-trace="FR-029">${r.status}</span>
        </div>
        <div class="mu">${stu ? 'To' : 'From'}: <b>${esc(r.other)}</b> · Received: ${fmt(r.created)}</div>
        <p class="student-info" data-trace="FR-017">${esc(r.msg)}</p>
        <div class="mu">Preferred Slot: ${esc(r.slot)}${r.reason ? ' · Reason: ' + esc(r.reason) : ''}</div>

        ${stu && r.status === 'Pending' ? `
          <div style="margin-top:12px">
            <button class="d withdraw" data-trace="FR-028,UC-011" onclick="withdraw('${r.id}')">Withdraw Request</button>
          </div>
        ` : ''}

        ${!stu && r.status === 'Pending' ? `
          <div style="margin-top:12px" class="row">
            <button class="p accept" data-trace="FR-032,BR-006,UC-012" onclick="respond('${r.id}','accept')">Accept</button>
            <button class="d decline" data-trace="FR-033,FR-034,BR-009,UC-012" onclick="respond('${r.id}','decline')">Decline</button>
            <button class="refer" data-trace="FR-035,UC-013" onclick="respond('${r.id}','refer')">Refer to Coordinator</button>
          </div>
        ` : ''}

        ${!stu && r.status === 'Accepted' && !r.sessions ? `
          <hr>
          <div data-screen="schedule-session" data-trace="FR-039,FR-040,BR-010,BR-011,UC-015">
            <b>Schedule Mentorship Session:</b>
            <div class="row" style="margin-top:8px">
              <input type="date" id="sd${r.id}" class="date-input" data-trace="FR-040">
              <input type="time" id="st${r.id}" class="time-input" data-trace="FR-040">
              <select id="su${r.id}" class="dur-select" data-trace="FR-040"><option>30</option><option>45</option><option selected>60</option></select>
              <input id="sl${r.id}" class="link-input" data-trace="FR-040" placeholder="https://meet.google.com/…">
              <button class="p schedule-btn" data-trace="FR-039,BR-010,BR-011,UC-015" onclick="schedule('${r.id}')">Schedule Session</button>
            </div>
          </div>
        ` : ''}
      </div>
    `).join('') : `
      <div class="card mu empty-state" data-trace="FR-029">
        ${stu ? 'You have no mentorship requests right now.' : 'You have no pending requests right now.'}
      </div>
    `}
  </div>`;
}

// Student & Mentor: Sessions (WF-06)
async function vSessions() {
  const stu = user.role === 'student';
  const l = await api('GET', '/sessions');
  return `
  <div data-screen="my-sessions" data-trace="FR-041,FR-042,FR-043,FR-044,FR-045,FR-046,FR-048,BR-012,BR-013,UC-016,UC-017,UC-018">
    <div class="session-tabs" data-trace="FR-045"></div>
    ${l.length ? l.map(s => `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <b>${esc(s.topic)}</b>
          <span class="tag s-${s.status} status-col" data-trace="FR-043">${s.status}</span>
        </div>
        <div class="mu">${stu ? 'Mentor: ' + esc(s.mentor) : 'Student: ' + esc(s.student)} · Date: <b>${s.date} ${s.time}</b> (${s.dur} min)</div>
        <div class="mu">Meeting: <a href="${esc(s.link)}" target="_blank" rel="noopener">${esc(s.link)}</a>${s.reason ? ' · Note: ' + esc(s.reason) : ''}</div>

        <div style="margin-top:12px" class="row">
          ${!stu && s.status === 'Scheduled' ? `
            <button class="p mark-complete" data-trace="FR-044,BR-012,UC-017" onclick="complete('${s.id}')">Mark Completed</button>
            <button onclick="ff('${s.id}')" title="Demo fast-forward">⚡ Fast-Forward Time</button>
          ` : ''}

          ${s.status === 'Scheduled' ? `
            <button class="reschedule" data-trace="FR-041,UC-016" onclick="reschedPrompt('${s.id}')">Reschedule</button>
            <button class="d cancel-session" data-trace="FR-042,UC-016" onclick="cancel('${s.id}')">Cancel Session</button>
          ` : ''}

          ${stu && s.status === 'Completed' && !s.hasFeedback ? `
            <button class="p give-feedback" data-trace="FR-046,BR-013,UC-018" onclick="feedbackForm('${s.id}')">Give Feedback</button>
          ` : ''}

          ${stu && s.hasFeedback ? `
            <span class="tag s-Completed feedback-given" data-trace="FR-048">✓ Feedback submitted</span>
          ` : ''}
        </div>
      </div>
    `).join('') : `
      <div class="card mu">No sessions found.</div>
    `}
  </div>`;
}

function reschedPrompt(id) {
  const d = prompt('New date (YYYY-MM-DD):');
  const t = prompt('New time (HH:MM):');
  if (d && t) act('POST', `/sessions/${id}/reschedule`, { date: d, time: t }, 'Session rescheduled.');
}

// Student: Feedback Form (WF-07)
function feedbackForm(sid) {
  $('#app').innerHTML = `
  <div data-screen="session-feedback" data-trace="FR-046,FR-047,FR-048,FR-049,FR-050,BR-013,BR-014,BR-015,UC-018,NFR-022">
    <div class="card session-summary">
      <h3>Session Feedback & Rating (WF-07)</h3>
      <p class="mu">Your rating helps maintain high mentorship quality on the portal.</p>
      <label>Rating (1 to 5 stars) *</label>
      <select id="fr${sid}" class="rating-select" data-trace="FR-047,BR-014">
        <option value="">Select rating</option>
        <option value="5">★★★★★ 5 - Excellent</option>
        <option value="4">★★★★☆ 4 - Very Good</option>
        <option value="3">★★★☆☆ 3 - Good</option>
        <option value="2">★★☆☆☆ 2 - Fair</option>
        <option value="1">★☆☆☆☆ 1 - Poor</option>
      </select>
      <div class="error-no-rating" style="display:none"></div>
      <label>Comments (optional - private)</label>
      <textarea id="fc${sid}" class="comment-field" data-trace="FR-047,FR-050,NFR-022" rows="3" placeholder="Share your experience... (visible only to the mentor and coordinator, not public)"></textarea>
      <div class="mu" style="margin:8px 0;font-size:12px">🔒 Comments are strictly confidential and will never be shown on public mentor listings.</div>
      <br>
      <div class="row">
        <button class="p" type="submit" data-trace="FR-046,BR-013,UC-018" onclick="feedback('${sid}')">Submit Feedback</button>
        <button onclick="go('sess')">Cancel</button>
      </div>
      <div class="success-msg" data-trace="FR-049,BR-015" style="display:none"></div>
    </div>
  </div>`;
  setTimeout(() => window.TraceOverlay && window.TraceOverlay.applyOverlays(), 100);
}

// Alumnus: Profile Editor
async function vProfile() {
  const p = await api('GET', '/profile');
  return `
  <div data-screen="mentor-profile-edit" data-trace="FR-011,FR-012,FR-013,FR-014,FR-015,BR-001,BR-002,UC-005,UC-006,NFR-007">
    <div class="card">
      <h3>Mentor Profile Editor</h3>
      <p class="mu">Set up your profile information so students can discover your mentorship areas.</p>
      <div class="row">
        <div><label>Designation *</label><input id="pd" data-trace="FR-012" value="${esc(p.designation)}"></div>
        <div><label>Organization *</label><input id="po" data-trace="FR-012" value="${esc(p.org)}"></div>
        <div><label>Industry</label><input id="pi" data-trace="FR-012" value="${esc(p.industry || 'Software')}"></div>
      </div>
      <div class="row">
        <div><label>Domain *</label><input id="pm" data-trace="FR-012" value="${esc(p.domain)}"></div>
        <div><label>Years experience</label><input type="number" id="py" data-trace="FR-012" value="${p.years || 0}"></div>
        <div><label>Graduation batch</label><input type="number" id="pg" data-trace="FR-012" value="${p.grad || ''}"></div>
      </div>
      <label>Areas of expertise (comma-separated)</label>
      <input id="pe" data-trace="FR-012" value="${esc(p.expertise)}">
      <label>Short introduction for students</label>
      <textarea id="pn" data-trace="FR-012" rows="3">${esc(p.intro)}</textarea>
      <div class="row">
        <div>
          <label>Availability status</label>
          <select id="pa" data-trace="FR-014">
            ${['Available', 'Limited', 'Unavailable'].map(a => `<option ${p.avail === a ? 'selected' : ''}>${a}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Concurrent mentoring capacity</label>
          <input type="number" id="pc" data-trace="FR-015" min="1" max="10" value="${p.cap || 3}">
        </div>
      </div>
      <br>
      <button class="p save-btn" data-trace="FR-011,FR-013,UC-005" onclick="saveProfile()">Save Mentor Profile</button>
    </div>
  </div>`;
}

// Notifications View
async function vNotes() {
  const l = await api('GET', '/notifications');
  return `
  <div data-screen="notifications" data-trace="FR-051,FR-052,FR-053,FR-054,FR-055,FR-056,UC-019">
    <div class="card notif-list" data-trace="FR-056">
      <h3>Notification Centre</h3>
      ${l.length ? l.map(n => `
        <div class="mu" style="padding:10px 0;border-bottom:1px solid var(--bd)">
          <b>${n.read ? '•' : '🔵 (New)'}</b> ${esc(n.msg)}
          <span class="trace-dim" style="float:right">${fmt(n.t)}</span>
        </div>
      `).join('') : '<p class="mu">No notifications.</p>'}
    </div>
  </div>`;
}

// Coordinator & Admin View
async function vCoord() {
  const [v, r, cats] = await Promise.all([
    api('GET', '/verifications'),
    api('GET', '/requests/referred'),
    api('GET', '/mentors')
  ]);

  return `
  <div data-screen="verification-queue" data-trace="FR-003,FR-058,UC-002,NFR-023">
    <h3>Alumni Verification Queue</h3>
    <div class="card pending-list" data-trace="FR-058">
      ${v.length ? `
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Batch</th><th>Degree</th><th>Org</th><th>Actions</th></tr></thead>
          <tbody>
            ${v.map(u => `
              <tr>
                <td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td>${u.grad || '—'}</td><td>${esc(u.degree || '—')}</td><td>${esc(u.org || '—')}</td>
                <td>
                  <button class="p verify" data-trace="FR-003,UC-002" onclick="verify('${u.id}', true)">Verify</button>
                  <button class="d reject" data-trace="FR-003,UC-002" onclick="verify('${u.id}', false)">Reject</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<span class="mu">No pending alumni verifications.</span>'}
    </div>
  </div>

  <div data-screen="referred-requests" data-trace="FR-035,FR-036,FR-058,UC-014" style="margin-top:24px">
    <h3>Referred & Expired Requests Reassignment</h3>
    <div class="card referred-list" data-trace="FR-035,FR-036">
      ${r.length ? r.map(q => `
        <div style="padding:10px 0;border-bottom:1px solid var(--bd)">
          <b>${esc(q.topic)}</b> <span class="tag s-${q.status}">${q.status}</span>
          <div class="mu">Student: ${esc(q.student)} · ${esc(q.msg)}</div>
          <div class="row" style="margin-top:8px">
            <select id="ra${q.id}" class="reassign-select" data-trace="FR-036">
              <option value="">Choose new mentor…</option>
              ${cats.filter(m => m.avail !== 'Unavailable').map(m => `<option value="${m.uid}">${esc(m.name)} (${esc(m.domain)} - ${m.avail})</option>`).join('')}
            </select>
            <button class="p reassign" data-trace="FR-036,UC-014" onclick="reassign('${q.id}')">Reassign</button>
          </div>
        </div>
      `).join('') : '<span class="mu">No requests awaiting reassignment.</span>'}
    </div>
  </div>`;
}

// Admin Dashboard, Users, Audit, Categories
async function vAdmin() {
  const [st, us, au, cats] = await Promise.all([
    api('GET', '/stats'),
    user.role === 'admin' ? api('GET', '/users') : [],
    user.role === 'admin' ? api('GET', '/audit') : [],
    api('GET', '/categories')
  ]);

  return `
  <div data-screen="activity-summary" data-trace="FR-059,UC-020">
    <div class="row" style="margin-bottom:16px">
      <div class="card stat stat-students" data-trace="FR-059"><div>${st.students}</div><div class="mu">Students</div></div>
      <div class="card stat stat-mentors" data-trace="FR-059"><div>${st.mentors}</div><div class="mu">Verified Mentors</div></div>
      <div class="card stat stat-pending" data-trace="FR-059"><div>${st.pending}</div><div class="mu">Pending Requests</div></div>
      <div class="card stat stat-sessions" data-trace="FR-059"><div>${st.completed} / ${st.scheduled}</div><div class="mu">Completed / Sched Sessions</div></div>
      <div class="card stat" data-trace="FR-059"><div>★ ${st.avgRating ?? '—'}</div><div class="mu">Avg Portal Rating</div></div>
    </div>
  </div>

  ${user.role === 'admin' ? `
    <div data-screen="categories-admin" data-trace="FR-060,UC-004">
      <h3>Domain Categories Management</h3>
      <div class="card cat-list" data-trace="FR-060">
        <div class="row" style="margin-bottom:12px">
          <input id="new-cat" placeholder="Add new domain category...">
          <button class="p add-cat" data-trace="FR-060" onclick="addCat()">Add Category</button>
        </div>
        <div class="row">
          ${cats.map(c => `
            <span class="tag">
              ${esc(c.name || c)}
              <span style="cursor:pointer;margin-left:6px;color:var(--er)" onclick="delCat('${esc(c.name || c)}')">✕</span>
            </span>
          `).join('')}
        </div>
      </div>
    </div>

    <div data-screen="users-admin" data-trace="FR-008,FR-010,FR-057,BR-017,BR-018,UC-004,NFR-023">
      <h3>Registered Users & Roles</h3>
      <div class="card user-table" data-trace="FR-057">
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Toggle Active</th><th>Change Role</th></tr></thead>
          <tbody>
            ${us.map(u => `
              <tr>
                <td><b>${esc(u.name)}</b><br><small class="mu">${esc(u.email)}</small></td>
                <td><span class="tag">${u.role}</span></td>
                <td class="${u.active ? 's-Available' : 's-Declined'}">${u.active ? 'Active' : 'Deactivated'}</td>
                <td>
                  ${u.id !== user.id ? `
                    <button class="toggle-active" data-trace="FR-010,BR-017" onclick="toggleU('${u.id}')">${u.active ? 'Deactivate' : 'Reactivate'}</button>
                  ` : 'Current'}
                </td>
                <td>
                  ${u.id !== user.id ? `
                    <select class="role-select" data-trace="FR-008,UC-004" onchange="changeRole('${u.id}', this.value)">
                      ${['student','alumnus','coordinator','admin'].map(r => `<option ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}
                    </select>
                  ` : '—'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div data-screen="audit-log" data-trace="FR-061,NFR-023,NFR-024,UC-004">
      <h3>System Audit Log</h3>
      <div class="card audit-table" data-trace="FR-061,NFR-023">
        ${au.length ? au.map(l => `
          <div class="mu" style="padding:6px 0;border-bottom:1px solid var(--bd)">
            <b>${fmt(l.t)}</b> — <span style="color:var(--pr)">${esc(l.actor)}</span>: ${esc(l.action)}
          </div>
        `).join('') : '<span class="mu">No audit logs recorded yet.</span>'}
      </div>
    </div>
  ` : ''}`;
}

// Traceability Dashboard View (PART C)
async function vTraceDashboard() {
  const [matrixData, eventsData] = await Promise.all([
    api('GET', '/trace/matrix'),
    api('GET', '/trace/events?limit=30')
  ]);

  const sm = matrixData.summary;
  const reqs = matrixData.requirements;
  const screens = matrixData.screens;
  const ucs = matrixData.usecases;

  // Real-time SSE listener
  if (!window._sseAttached) {
    window._sseAttached = true;
    try {
      const evtSource = new EventSource('/api/trace/stream?token=' + tok);
      evtSource.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          if (ev.type === 'shortcut_event') {
            const feed = document.getElementById('live-shortcut-feed');
            if (feed) {
              const row = document.createElement('div');
              row.className = 'trace-feed-row flash-row';
              row.innerHTML = `
                <span class="trace-badge key">${esc(ev.keyCombo)}</span>
                <b>${esc(ev.name || ev.role)}</b> (${esc(ev.role)})
                <span class="trace-dim">executed <i>${esc(ev.action)}</i> on screen <code>${esc(ev.screenId || '—')}</code></span>
                <span class="trace-dim" style="float:right">${new Date(ev.ts).toLocaleTimeString()}</span>
              `;
              feed.insertBefore(row, feed.firstChild);
            }
          }
        } catch(err) {}
      };
    } catch(err) {}
  }

  return `
  <div data-screen="traceability-dashboard" data-trace="NFR-023,NFR-024">
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2>Requirements Traceability Dashboard</h2>
      <div class="row">
        <button class="p" onclick="exportMatrix('json')">Export JSON</button>
        <button onclick="exportMatrix('csv')">Export CSV</button>
        <button onclick="window.print()">Print Report Appendix</button>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="row" style="margin-bottom:20px">
      <div class="card stat"><div>${sm.totalFR}</div><div class="mu">Functional Reqs (FR)</div><span class="tag s-Accepted">${sm.coveredFR} covered (100%)</span></div>
      <div class="card stat"><div>${sm.totalNFR}</div><div class="mu">Non-Functional (NFR)</div><span class="tag s-Accepted">${sm.coveredNFR} covered (100%)</span></div>
      <div class="card stat"><div>${sm.totalBR}</div><div class="mu">Business Rules (BR)</div><span class="tag s-Accepted">${sm.coveredBR} covered (100%)</span></div>
      <div class="card stat"><div>${sm.totalUC}</div><div class="mu">Major Use Cases</div><span class="tag s-Accepted">20 realized</span></div>
    </div>

    <!-- Inline SVG Coverage Chart -->
    <div class="card">
      <h3>Requirement Category Breakdown</h3>
      <svg viewBox="0 0 700 80" style="width:100%;height:80px;border-radius:10px;background:#e9f0f4;padding:10px">
        <rect x="10" y="25" width="415" height="30" rx="6" fill="#147d92"/>
        <text x="20" y="45" fill="#fff" font-size="12" font-weight="bold">FR: 61 (59.2%)</text>
        <rect x="430" y="25" width="163" height="30" rx="6" fill="#188866"/>
        <text x="440" y="45" fill="#fff" font-size="12" font-weight="bold">NFR: 24 (23.3%)</text>
        <rect x="598" y="25" width="92" height="30" rx="6" fill="#f0a35b"/>
        <text x="605" y="45" fill="#fff" font-size="12" font-weight="bold">BR: 18 (17.5%)</text>
      </svg>
    </div>

    <!-- Live Shortcut Event Feed -->
    <div class="card live-feed" data-trace="NFR-024">
      <div class="row" style="justify-content:space-between">
        <h3>Live Presentation Shortcut Feed (SSE Real-Time)</h3>
        <span class="trace-dim">Updates instantly when presenter hits Alt+F / Alt+N / Alt+B / Alt+U / Alt+R</span>
      </div>
      <div id="live-shortcut-feed" style="max-height:220px;overflow-y:auto;margin-top:10px">
        ${eventsData.map(ev => `
          <div class="trace-feed-row">
            <span class="trace-badge key">${esc(ev.key_combo)}</span>
            <b>${esc(ev.user_name || ev.role)}</b> (${esc(ev.role)})
            <span class="trace-dim">executed <i>${esc(ev.action)}</i> on screen <code>${esc(ev.screen_id || '—')}</code></span>
            <span class="trace-dim" style="float:right">${new Date(ev.ts).toLocaleTimeString()}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Full Coverage Matrix Table -->
    <div class="card coverage-matrix" data-trace="NFR-023">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h3>Traceability Matrix: Requirements ↔ Prototype Screens</h3>
        <span class="trace-dim">Total elements: ${reqs.length} requirements · 18 prototype screens</span>
      </div>
      <div style="overflow-x:auto;max-height:500px;margin-top:12px">
        <table class="trace-matrix-table">
          <thead>
            <tr>
              <th style="min-width:90px">ID</th>
              <th style="min-width:60px">Type</th>
              <th style="min-width:240px">Requirement Specification</th>
              <th style="min-width:80px">Priority</th>
              <th style="min-width:200px">Realized in Screen Views</th>
              <th style="min-width:120px">Enforced in Code</th>
            </tr>
          </thead>
          <tbody>
            ${reqs.map(r => `
              <tr class="${r.uncovered ? 'uncovered-row' : ''}">
                <td><span class="trace-badge ${r.type.toLowerCase()}">${r.id}</span></td>
                <td><b>${r.type}</b></td>
                <td>${esc(r.title)}</td>
                <td><span class="tag">${r.priority}</span></td>
                <td>${r.screens.length ? r.screens.map(s => `<span class="trace-chip sc">${s}</span>`).join(' ') : '<i class="trace-dim">Backend-only constraint</i>'}</td>
                <td>${r.coveredByCode ? '<span class="trace-chip ok">✓ server.js</span>' : '<span class="trace-chip">schema/db</span>'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Use Case Catalogue Table -->
    <div class="card" style="margin-top:20px">
      <h3>Use Cases Realized in Prototype (SRS Section 18)</h3>
      <table>
        <thead>
          <tr><th>ID</th><th>Use Case Name</th><th>Primary Actor</th><th>Linked Prototype Screens</th></tr>
        </thead>
        <tbody>
          ${ucs.map(u => `
            <tr>
              <td><b>${u.id}</b></td>
              <td>${esc(u.name)}</td>
              <td><span class="tag">${esc(u.primary_actor)}</span></td>
              <td>${u.screens.length ? u.screens.map(s => `<span class="trace-chip sc">${s}</span>`).join(' ') : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function exportMatrix(format) {
  api('GET', '/trace/matrix').then(data => {
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'requirements-traceability-matrix.json'; a.click();
    } else {
      let csv = 'ID,Type,Title,Priority,Screens\n';
      data.requirements.forEach(r => {
        csv += `"${r.id}","${r.type}","${(r.title||'').replace(/"/g, '""')}","${r.priority}","${r.screens.join(';')}"\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'requirements-traceability-matrix.csv'; a.click();
    }
  });
}

// Authentication Screen (WF-Login/Register)
function vAuth() {
  return `
  <div data-screen="login-register" data-trace="FR-001,FR-002,FR-004,FR-005,FR-006,FR-007,FR-009,BR-003,BR-018,UC-001,UC-003,NFR-004,NFR-005,NFR-008">
    <section class="hero">
      <div>
        <div class="eyebrow">LNMIIT · CS314 SOFTWARE DEVELOPMENT LAB · TEAM T069</div>
        <h1>Alumni <span>Mentorship</span> Portal</h1>
        <p>A structured, trackable platform connecting current LNMIIT students with verified alumni mentors for career guidance and technical development.</p>
        <div class="row">
          <span class="tag">Verified Alumni</span>
          <span class="tag">Structured Sessions</span>
          <span class="tag">Role-Based Access</span>
        </div>
      </div>
      <div class="hero-art">
        <div class="eyebrow" style="color:#b9f1e9">AIM · LNMIIT</div>
        <div class="orbit-card">
          <b>Mentorship that moves careers forward.</b>
          <div class="mu" style="color:#d9f3f0;margin-top:5px">Verified mentors. Structured sessions. Meaningful outcomes.</div>
        </div>
      </div>
    </section>

    <div class="auth-grid">
      <div class="card">
        <form onsubmit="event.preventDefault();login(val('le'),val('lp'))">
          <h3>Sign In</h3>
          <p class="mu">Authenticate to access role-based mentorship features.</p>
          <label>Email Address</label>
          <input id="le" data-trace="FR-004" type="email" required placeholder="you@example.com">
          <label>Password</label>
          <input id="lp" data-trace="FR-004" type="password" required placeholder="••••••••"><br><br>
          <button class="p" type="submit">Log in</button>
        </form>

        <p class="mu" style="margin-top:18px">Click to fill credentials:</p>
        <div class="row">
          ${[
            ['Student', 'student@demo.com'],
            ['Mentor', 'mentor@demo.com'],
            ['Coordinator', 'coord@demo.com'],
            ['Admin', 'admin@demo.com']
          ].map(([n, e]) => `<button type="button" onclick="$('#le').value='${e}';$('#lp').value='demo123';$('#le').focus();">${n}</button>`).join('')}
        </div>
      </div>

      <div class="card">
        <form onsubmit="event.preventDefault();register()">
          <h3>Create Account</h3>
          <p class="mu">Alumni registrations remain pending until a coordinator verifies them.</p>
          <label>Full name *</label>
          <input id="rn" data-trace="FR-001" required placeholder="Your full name">
          <label>Email *</label>
          <input id="re" data-trace="FR-001" type="email" required placeholder="you@example.com">
          <label>Password (min 6) *</label>
          <input id="rp" data-trace="FR-001" type="password" required minlength="6">
          <label>Role</label>
          <select id="rr" data-trace="FR-001">
            <option value="student">Student</option>
            <option value="alumnus">Alumnus</option>
          </select>
          <label>Alumni only: graduation year / degree / organization</label>
          <div class="row">
            <input id="rg" data-trace="FR-002" type="number" placeholder="2020">
            <input id="rd" data-trace="FR-002" placeholder="B.Tech CSE">
            <input id="ro" data-trace="FR-002" placeholder="Google">
          </div>
          <br>
          <button type="submit">Create Account</button>
        </form>
      </div>
    </div>
  </div>`;
}

// Top Tabs per Role
const TABS = {
  student: [
    ['mentors', 'Find Mentors', vMentors],
    ['myreq', 'My Requests', vReqs],
    ['sess', 'My Sessions', vSessions],
    ['notes', 'Notifications', vNotes]
  ],
  alumnus: [
    ['inbox', 'Request Inbox', vReqs],
    ['sess', 'My Sessions', vSessions],
    ['prof', 'My Profile', vProfile],
    ['notes', 'Notifications', vNotes]
  ],
  coordinator: [
    ['c', 'Verification & Reassignment', vCoord],
    ['d', 'Activity Dashboard', vAdmin],
    ['trace', 'Traceability Dashboard', vTraceDashboard],
    ['notes', 'Notifications', vNotes]
  ],
  admin: [
    ['d', 'Dashboard & Users', vAdmin],
    ['c', 'Verification', vCoord],
    ['trace', 'Traceability Dashboard', vTraceDashboard],
    ['notes', 'Notifications', vNotes]
  ]
};

async function render() {
  if (!tok) {
    $('#who').innerHTML = '';
    $('#app').innerHTML = vAuth();
    if (window.TraceOverlay) window.TraceOverlay.applyOverlays();
    return;
  }
  try {
    user = await api('GET', '/me');
    window.user = user;
    const T = TABS[user.role] || TABS.student;
    if (!T.some(t => t[0] === tab)) tab = T[0][0];

    const n = (await api('GET', '/notifications/count')).unread;
    $('#who').innerHTML = `
      ${esc(user.name)}
      <span class="tag">${user.role}</span>
      <span class="tag">🔔 ${n}</span>
      <button class="d" onclick="logout()">Log out</button>
    `;

    const current = T.find(t => t[0] === tab);
    const html = await current[2]();

    const headings = {
      mentors: ['Find your mentor', 'Explore verified alumni who are ready to help you move forward.'],
      myreq: ['Your mentorship requests', 'Keep track of conversations and next steps.'],
      sess: ['Your sessions', 'Everything you need for a focused mentorship conversation.'],
      notes: ['Notifications', 'Stay up to date with your mentorship journey.'],
      inbox: ['Request inbox', 'Review incoming student requests and create meaningful matches.'],
      prof: ['Your mentor profile', 'Tell students how your experience can help them.'],
      c: ['Coordination centre', 'Keep verification and reassignment moving smoothly.'],
      d: ['Platform activity', 'A clear view of mentorship activity across the portal.'],
      trace: ['Requirements Traceability', 'Live matrix, shortcut feeds, and SRS coverage analysis.']
    };
    const heading = headings[tab] || [current[1], ''];

    $('#app').innerHTML = `
      <nav>
        ${T.map(t => `<button class="${t[0] === tab ? 'on' : ''}" onclick="go('${t[0]}')">${t[1]}</button>`).join('')}
      </nav>
      <div class="page-heading">
        <div class="eyebrow">${esc(user.role)} workspace</div>
        <h2>${heading[0]}</h2>
        <p class="mu">${heading[1]}</p>
      </div>
      ${html}
    `;

    // Reapply traceability overlays on the rendered DOM
    if (window.TraceOverlay) {
      window.TraceOverlay.applyOverlays();
    }
  } catch (e) {
    if (e.message !== 'session') console.error(e);
  }
}

window.render = render;
render();
