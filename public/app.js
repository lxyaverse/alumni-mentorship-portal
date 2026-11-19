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
          <button type="button" onclick="forgotPassword()">Forgot password?</button>

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
      <button class="notification-button${n ? ' has-unread' : ''}" onclick="openNotifications()" aria-label="Notifications${n ? `, ${n} unread` : ', no unread notifications'}" title="Notifications">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 16v-5a6 6 0 0 0-4.8-5.88V4a1.2 1.2 0 0 0-2.4 0v1.12A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2Zm-6 5a2.2 2.2 0 0 0 2.18-1.88h-4.36A2.2 2.2 0 0 0 12 21Z"/>
        </svg>
        ${n ? `<span class="notification-badge">${n > 99 ? '99+' : n}</span>` : ''}
      </button>
      <button class="d" onclick="openAccountSettings()">Account Settings</button>
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
