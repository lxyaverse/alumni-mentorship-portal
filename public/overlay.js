// Requirements Traceability Overlay & Shortcuts Engine
// Handles: Alt+F (FR), Alt+N (NFR), Alt+B (BR), Alt+U (UC), Alt+A (All), Alt+T (Dashboard), Alt+? (Cheat-sheet), Alt+R (Role cycle), Alt+L (Event log), Esc (Close all)
(function() {
  'use strict';

  const SHORTCUTS = {
    'Alt+f': { action: 'TOGGLE_FR', desc: 'Toggle Functional Requirements overlay (blue badges & outlines)' },
    'Alt+n': { action: 'TOGGLE_NFR', desc: 'Toggle Non-Functional Requirements chips & badges (green)' },
    'Alt+b': { action: 'TOGGLE_BR', desc: 'Toggle Business Rules overlay (orange badges & enforcement info)' },
    'Alt+u': { action: 'TOGGLE_UC', desc: 'Toggle Use Case side panel with Primary Actor & step tracking' },
    'Alt+h': { action: 'TOGGLE_HINT', desc: 'Toggle floating bottom shortcut hint bar' },
    'Alt+a': { action: 'TOGGLE_ALL', desc: 'Toggle all overlays simultaneously' },
    'Alt+t': { action: 'OPEN_DASHBOARD', desc: 'Open / close Traceability Dashboard' },
    'Alt+?': { action: 'OPEN_HELP', desc: 'Show keyboard shortcuts cheat-sheet' },
    'Alt+/': { action: 'OPEN_HELP', desc: 'Show keyboard shortcuts cheat-sheet' },
    'Shift+/': { action: 'OPEN_HELP', desc: 'Show keyboard shortcuts cheat-sheet' },
    'Alt+r': { action: 'CYCLE_ROLE', desc: 'Cycle demo accounts (Student → Mentor → Coord → Admin)' },
    'Alt+l': { action: 'TOGGLE_LOG', desc: 'Toggle live shortcut event log drawer' },
    'Escape': { action: 'CLOSE_ALL', desc: 'Close all overlays, panels, and modals' },
  };

  // Overlay state is intentionally non-persistent so the evaluator view starts clean.
  const defaultState = { fr: false, nfr: false, br: false, uc: false, log: false };
  let overlayState = { ...defaultState };

  function saveState() {
    // Intentionally not persisted: evaluator view must always start clean.
  }

  // Cross-tab communication channel
  let traceChannel = null;
  try {
    traceChannel = new BroadcastChannel('amp_traceability');
  } catch(e) {}

  // Announce for accessibility
  function announce(msg) {
    let el = document.getElementById('trace-aria-live');
    if (!el) {
      el = document.createElement('div');
      el.id = 'trace-aria-live';
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true');
      el.className = 'sr-only';
      document.body.appendChild(el);
    }
    el.textContent = msg;
  }

  // Current screen detection
  function getCurrentScreenId() {
    const active = document.querySelector('[data-screen]');
    return active ? active.getAttribute('data-screen') : 'login-register';
  }

  // Send event to server and broadcast
  async function logEvent(keyCombo, action, screenId) {
    screenId = screenId || getCurrentScreenId();
    if (traceChannel) {
      try {
        traceChannel.postMessage({ type: 'SHORTCUT_PRESSED', keyCombo, action, screenId, ts: Date.now() });
      } catch(e) {}
    }
    // Also append locally to event drawer
    appendLocalEvent({ keyCombo, action, screenId, ts: Date.now() });

    try {
      const tok = localStorage.getItem('amp-token');
      if (tok) {
        await fetch('/api/trace/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
          body: JSON.stringify({ keyCombo, action, screenId })
        });
      }
    } catch(e) {}
  }

  // Local event log array
  const localEvents = [];
  function appendLocalEvent(ev) {
    localEvents.unshift(ev);
    if (localEvents.length > 50) localEvents.pop();
    const container = document.getElementById('trace-event-log-list');
    if (container) {
      container.innerHTML = localEvents.map(e => `
        <div class="trace-log-item">
          <span class="trace-badge key">${e.keyCombo}</span>
          <span class="trace-badge act">${e.action}</span>
          <span class="trace-dim">screen: ${e.screenId} · ${new Date(e.ts).toLocaleTimeString()}</span>
        </div>
      `).join('');
    }
  }

  // Render floating hint bar and legend
  function ensureHintBar() {
    if (document.getElementById('trace-hint-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'trace-hint-bar';
    bar.style.display = 'none'; // Hidden by default; toggle with Alt+? or Alt+A
    bar.innerHTML = `
      <div class="trace-hint-content">
        <span class="trace-hint-btn" onclick="window.TraceOverlay.toggleHelp()" title="Keyboard shortcuts (Alt+?)">⌨ <b>Alt+?</b> for shortcuts</span>
        <span class="trace-pill fr-pill ${overlayState.fr ? 'on' : ''}" onclick="window.TraceOverlay.toggle('fr')">FR (Alt+F)</span>
        <span class="trace-pill nfr-pill ${overlayState.nfr ? 'on' : ''}" onclick="window.TraceOverlay.toggle('nfr')">NFR (Alt+N)</span>
        <span class="trace-pill br-pill ${overlayState.br ? 'on' : ''}" onclick="window.TraceOverlay.toggle('br')">BR (Alt+B)</span>
        <span class="trace-pill uc-pill ${overlayState.uc ? 'on' : ''}" onclick="window.TraceOverlay.toggle('uc')">Use Cases (Alt+U)</span>
        <span class="trace-pill all-pill" onclick="window.TraceOverlay.toggleAll()">All (Alt+A)</span>
        <span class="trace-pill dash-pill" onclick="window.TraceOverlay.openDashboard()">Dashboard (Alt+T)</span>
        <span class="trace-pill role-pill" onclick="window.TraceOverlay.cycleRole()" title="Cycle demo role (Alt+R)">Role ⇄ (Alt+R)</span>
      </div>
    `;
    document.body.appendChild(bar);
  }

  // Render floating screen counts legend
  function updateLegend(screenData) {
    let legend = document.getElementById('trace-screen-legend');
    if (!legend) {
      legend = document.createElement('div');
      legend.id = 'trace-screen-legend';
      document.body.appendChild(legend);
    }
    const frCount = screenData?.frs?.length || 0;
    const nfrCount = screenData?.nfrs?.length || 0;
    const brCount = screenData?.brs?.length || 0;
    const ucCount = screenData?.usecases?.length || 0;
    legend.innerHTML = `
      <div class="trace-legend-pill">
        <span class="trace-chip fr">FR ${frCount}</span>
        <span class="trace-chip nfr">NFR ${nfrCount}</span>
        <span class="trace-chip br">BR ${brCount}</span>
        <span class="trace-chip uc">UC ${ucCount}</span>
      </div>
    `;
    legend.style.display = (overlayState.fr || overlayState.nfr || overlayState.br || overlayState.uc) ? 'block' : 'none';
  }

  // Cache for screen trace details from server
  const screenCache = {};
  async function fetchScreenData(screenId) {
    if (screenCache[screenId]) return screenCache[screenId];
    try {
      const tok = localStorage.getItem('amp-token');
      const res = await fetch(`/api/trace/screen/${screenId}`, {
        headers: tok ? { 'Authorization': 'Bearer ' + tok } : {}
      });
      if (res.ok) {
        const data = await res.json();
        screenCache[screenId] = data;
        return data;
      }
    } catch(e) {}
    return { frs: [], nfrs: [], brs: [], usecases: [], links: [] };
  }

  // Apply overlays on elements
  async function applyOverlays() {
    ensureHintBar();
    const screenId = getCurrentScreenId();
    const data = await fetchScreenData(screenId);
    updateLegend(data);

    // Update hint bar button active classes
    const setPill = (cls, on) => {
      const el = document.querySelector(`.trace-pill.${cls}`);
      if (el) el.classList.toggle('on', !!on);
    };
    setPill('fr-pill', overlayState.fr);
    setPill('nfr-pill', overlayState.nfr);
    setPill('br-pill', overlayState.br);
    setPill('uc-pill', overlayState.uc);

    // Clear old badges & highlights
    document.querySelectorAll('.trace-badge-container').forEach(el => el.remove());
    document.querySelectorAll('.trace-highlight-fr, .trace-highlight-br, .trace-highlight-nfr').forEach(el => {
      el.classList.remove('trace-highlight-fr', 'trace-highlight-br', 'trace-highlight-nfr');
    });
    document.querySelectorAll('#trace-nfr-bar').forEach(el => el.remove());

    // NFR page-level bar (NFR chips)
    if (overlayState.nfr && data.nfrs && data.nfrs.length > 0) {
      const nfrBar = document.createElement('div');
      nfrBar.id = 'trace-nfr-bar';
      nfrBar.innerHTML = `
        <div class="trace-nfr-inner">
          <span class="trace-nfr-label">🛡 NFRs Exercised:</span>
          ${data.nfrs.map(n => `
            <span class="trace-chip nfr clickable" onclick="window.TraceOverlay.openDetail('${n.id}','NFR')" title="${escapeHtml(n.description)}">
              <b>${n.id}</b>: ${escapeHtml(n.category || n.title)}
            </span>
          `).join('')}
        </div>
      `;
      const mainApp = document.getElementById('app');
      if (mainApp) mainApp.insertBefore(nfrBar, mainApp.firstChild);
    }

    // Attach FR & BR element badges based on links
    if (data.links) {
      data.links.forEach(link => {
        if (!link.element_selector) return;
        const target = document.querySelector(link.element_selector);
        if (!target) return;

        const showBadge = (link.ref_type === 'FR' && overlayState.fr) ||
                          (link.ref_type === 'BR' && overlayState.br) ||
                          (link.ref_type === 'NFR' && overlayState.nfr);

        if (showBadge) {
          // Highlight target element
          if (link.ref_type === 'FR') target.classList.add('trace-highlight-fr');
          if (link.ref_type === 'BR') target.classList.add('trace-highlight-br');
          if (link.ref_type === 'NFR') target.classList.add('trace-highlight-nfr');

          // Append or find badge container
          let container = target.parentElement.querySelector(':scope > .trace-badge-container');
          if (!container) {
            container = document.createElement('span');
            container.className = 'trace-badge-container';
            if (window.getComputedStyle(target.parentElement).position === 'static') {
              target.parentElement.style.position = 'relative';
            }
            target.parentElement.appendChild(container);
          }

          const badge = document.createElement('span');
          badge.className = `trace-badge ${link.ref_type.toLowerCase()}`;
          badge.textContent = link.ref_id;
          badge.title = `${link.ref_type} ${link.ref_id}: ${link.note || ''} (Click to inspect)`;
          badge.onclick = (e) => {
            e.stopPropagation();
            window.TraceOverlay.openDetail(link.ref_id, link.ref_type);
          };
          container.appendChild(badge);
        }
      });
    }

    // Update Use Case panel if open
    if (overlayState.uc) {
      renderUseCasePanel(data);
    } else {
      closeUseCasePanel();
    }
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Use Case side panel
  async function renderUseCasePanel(data) {
    let panel = document.getElementById('trace-uc-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'trace-uc-panel';
      document.body.appendChild(panel);
    }
    panel.style.display = 'block';

    const tok = localStorage.getItem('amp-token');
    let allUcs = [];
    try {
      const res = await fetch('/api/trace/usecases', { headers: tok ? { 'Authorization': 'Bearer ' + tok } : {} });
      if (res.ok) allUcs = await res.json();
    } catch(e) {}

    const curRole = (window.user && window.user.role) || 'student';
    const screenId = getCurrentScreenId();

    const curUcs = (data.usecases || []).map(u => {
      const full = allUcs.find(item => item.id === u.id);
      return full || u;
    });

    panel.innerHTML = `
      <div class="trace-panel-header">
        <div>
          <h3>Use Cases on this Screen</h3>
          <span class="trace-dim">Screen: <b>${screenId}</b> · Current Role: <b>${curRole}</b></span>
        </div>
        <button class="trace-close-btn" onclick="window.TraceOverlay.toggle('uc')">✕</button>
      </div>
      <div class="trace-panel-body">
        ${curUcs.length === 0 ? '<p class="trace-dim">No specific use cases tied to this view.</p>' : ''}
        ${curUcs.map(uc => {
          const isActorMatch = (uc.primary_actor || uc.primaryActor || '').toLowerCase().includes(curRole.toLowerCase()) ||
                               (uc.primary_actor || uc.primaryActor || '').toLowerCase().includes('all');
          const mainFlow = uc.mainFlow || [];
          return `
            <div class="trace-uc-card">
              <div class="trace-uc-header">
                <b>${uc.id}: ${escapeHtml(uc.name)}</b>
                <span class="trace-actor-badge ${isActorMatch ? 'match' : 'other'}">
                  Primary: ${escapeHtml(uc.primary_actor || uc.primaryActor)} ${isActorMatch ? '✓ (Your Role)' : ''}
                </span>
              </div>
              ${uc.secondaryActors && uc.secondaryActors.length ? `<div class="trace-dim">Secondary: ${uc.secondaryActors.join(', ')}</div>` : ''}
              
              ${uc.preconditions && uc.preconditions.length ? `
                <div class="trace-sec-title">Preconditions:</div>
                <ul class="trace-list">${uc.preconditions.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
              ` : ''}

              ${mainFlow.length ? `
                <div class="trace-sec-title">Main Flow Steps:</div>
                <ol class="trace-flow-list">
                  ${mainFlow.map(step => {
                    const isCurStep = step.screen === screenId;
                    return `
                      <li class="${isCurStep ? 'cur-step' : ''}">
                        ${escapeHtml(step.text)}
                        ${isCurStep ? '<span class="trace-cur-step-badge">◀ YOU ARE HERE</span>' : ''}
                      </li>
                    `;
                  }).join('')}
                </ol>
              ` : ''}

              ${uc.altFlows && uc.altFlows.length ? `
                <div class="trace-sec-title">Alternative / Exception Flows:</div>
                <ul class="trace-list">${uc.altFlows.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
              ` : ''}

              ${uc.postconditions && uc.postconditions.length ? `
                <div class="trace-sec-title">Postconditions:</div>
                <ul class="trace-list">${uc.postconditions.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
              ` : ''}

              <div class="trace-uc-chips">
                ${(uc.relatedFR || []).map(f => `<span class="trace-chip fr clickable" onclick="window.TraceOverlay.openDetail('${f}','FR')">${f}</span>`).join('')}
                ${(uc.relatedBR || []).map(b => `<span class="trace-chip br clickable" onclick="window.TraceOverlay.openDetail('${b}','BR')">${b}</span>`).join('')}
                ${(uc.relatedNFR || []).map(n => `<span class="trace-chip nfr clickable" onclick="window.TraceOverlay.openDetail('${n}','NFR')">${n}</span>`).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function closeUseCasePanel() {
    const panel = document.getElementById('trace-uc-panel');
    if (panel) panel.style.display = 'none';
  }

  // Requirement Detail Drawer (Click-through)
  async function openDetail(id, type) {
    let drawer = document.getElementById('trace-detail-drawer');
    if (!drawer) {
      drawer = document.createElement('div');
      drawer.id = 'trace-detail-drawer';
      document.body.appendChild(drawer);
    }
    drawer.style.display = 'block';

    const tok = localStorage.getItem('amp-token');
    let reqInfo = null;
    try {
      const res = await fetch(`/api/trace/requirements?q=${id}`, {
        headers: tok ? { 'Authorization': 'Bearer ' + tok } : {}
      });
      if (res.ok) {
        const rows = await res.json();
        reqInfo = rows.find(r => r.id === id);
      }
    } catch(e) {}

    if (!reqInfo) {
      reqInfo = { id, type, title: `${type} Requirement`, description: 'Requirement details from SRS baseline.', priority: 'High', enforcedAt: [] };
    }

    drawer.innerHTML = `
      <div class="trace-panel-header">
        <div>
          <h3><span class="trace-badge ${type.toLowerCase()}">${id}</span> ${escapeHtml(reqInfo.title)}</h3>
          <span class="trace-dim">Category: ${escapeHtml(reqInfo.category || type)} · Priority: <b>${escapeHtml(reqInfo.priority || 'Medium')}</b></span>
        </div>
        <button class="trace-close-btn" onclick="document.getElementById('trace-detail-drawer').style.display='none'">✕</button>
      </div>
      <div class="trace-panel-body">
        <div class="trace-sec-title">Full SRS Specification Text:</div>
        <p class="trace-req-desc">${escapeHtml(reqInfo.description)}</p>

        ${reqInfo.enforcedAt && reqInfo.enforcedAt.length > 0 ? `
          <div class="trace-sec-title">Enforced At (Server Code Scan):</div>
          <div class="trace-code-box">
            ${reqInfo.enforcedAt.map(e => `
              <div class="trace-code-line">
                <code>${e.file}:${e.line}</code> — <i>${escapeHtml(e.snippet)}</i>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="trace-sec-title">Enforcement / Implementation Note:</div>
          <p class="trace-dim">Enforced via platform schema, service layer authorization, and role-based client views.</p>
        `}
      </div>
    `;
  }

  // Cheat-sheet Modal (Alt+? or Shift+/)
  function toggleHelp() {
    let modal = document.getElementById('trace-help-modal');
    if (modal && modal.style.display === 'block') {
      modal.style.display = 'none';
      return;
    }
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'trace-help-modal';
      document.body.appendChild(modal);
    }
    const screenId = getCurrentScreenId();
    const curRole = (window.user && window.user.role) || 'student';
    modal.innerHTML = `
      <div class="trace-modal-card">
        <div class="trace-panel-header">
          <div>
            <h3>⌨ Requirements Traceability Keyboard Shortcuts</h3>
            <span class="trace-dim">Active Screen: <b>${screenId}</b> · Current Role: <b>${curRole}</b></span>
          </div>
          <button class="trace-close-btn" onclick="document.getElementById('trace-help-modal').style.display='none'">✕</button>
        </div>
        <table class="trace-table">
          <thead>
            <tr><th>Shortcut</th><th>Action</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td><kbd>Alt+F</kbd></td><td>Toggle FR Overlay</td><td>Badges and outlines (blue) for Functional Requirements; hover for text</td></tr>
            <tr><td><kbd>Alt+N</kbd></td><td>Toggle NFR Overlay</td><td>Cross-cutting Non-Functional Requirements chips & element badges (green)</td></tr>
            <tr><td><kbd>Alt+B</kbd></td><td>Toggle BR Overlay</td><td>Business Rules badges (orange) + click to see server enforcement line</td></tr>
            <tr><td><kbd>Alt+U</kbd></td><td>Toggle Use Case Panel</td><td>Real-time side panel: Primary Actor, preconditions, steps with current step highlight</td></tr>
            <tr><td><kbd>Alt+A</kbd></td><td>Toggle All Overlays</td><td>Turns all FR, NFR, BR badges and Use Case panel on or off together</td></tr>
            <tr><td><kbd>Alt+T</kbd></td><td>Traceability Dashboard</td><td>Open live coverage matrix, live shortcut feed, and charts (admin/coord)</td></tr>
            <tr><td><kbd>Alt+R</kbd></td><td>Cycle Demo Role</td><td>Instant switch: Student ⇄ Mentor ⇄ Coordinator ⇄ Administrator</td></tr>
            <tr><td><kbd>Alt+L</kbd></td><td>Live Event Log</td><td>Toggle live drawer logging every shortcut pressed in real time</td></tr>
            <tr><td><kbd>Alt+?</kbd> or <kbd>Shift+/</kbd></td><td>Cheat Sheet</td><td>Show this shortcuts and active role reference</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>Close Overlays</td><td>Dismiss all open drawers, panels, and modals</td></tr>
          </tbody>
        </table>
        <div class="trace-modal-footer">
          <span class="trace-dim">Shortcuts function globally on every screen without typing interference.</span>
          <button class="p" onclick="document.getElementById('trace-help-modal').style.display='none'">Close</button>
        </div>
      </div>
    `;
    modal.style.display = 'block';
    logEvent('Alt+?', 'OPEN_HELP', screenId);
  }

  // Live Event Drawer (Alt+L)
  function toggleLogDrawer() {
    let drawer = document.getElementById('trace-event-drawer');
    if (!drawer) {
      drawer = document.createElement('div');
      drawer.id = 'trace-event-drawer';
      drawer.innerHTML = `
        <div class="trace-panel-header">
          <h3>Live Shortcut Events Log</h3>
          <button class="trace-close-btn" onclick="document.getElementById('trace-event-drawer').style.display='none'">✕</button>
        </div>
        <div id="trace-event-log-list" class="trace-panel-body">
          <p class="trace-dim">No events logged yet. Press Alt+F, Alt+N, Alt+B, Alt+U to see events live!</p>
        </div>
      `;
      document.body.appendChild(drawer);
    }
    const isVisible = drawer.style.display === 'block';
    drawer.style.display = isVisible ? 'none' : 'block';
    overlayState.log = !isVisible;
    saveState();
    logEvent('Alt+L', 'TOGGLE_LOG', getCurrentScreenId());
  }

  // Cycle demo accounts (Alt+R)
  async function cycleRole() {
    try {
      const curRole = (window.user && window.user.role) || 'student';
      const res = await fetch('/api/demo/next-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentRole: curRole })
      });
      if (res.ok) {
        const j = await res.json();
        localStorage.setItem('amp-token', j.token);
        window.tok = j.token;
        window.user = j.user;
        if (window.toast) window.toast(`Switched to demo role: ${j.user.role} (${j.user.name})`);
        announce(`Switched to ${j.user.role}`);
        logEvent('Alt+R', 'CYCLE_ROLE_' + j.user.role.toUpperCase(), getCurrentScreenId());
        if (typeof window.render === 'function') window.render();
      } else {
        if (window.toast) window.toast('Role cycle available in DEMO mode.');
      }
    } catch(e) {
      if (window.toast) window.toast('Error switching role: ' + e.message);
    }
  }

  // Toggle specific overlay
  function toggle(type) {
    if (overlayState[type] !== undefined) {
      overlayState[type] = !overlayState[type];
      saveState();
      announce(`${type.toUpperCase()} overlay ${overlayState[type] ? 'enabled' : 'disabled'}`);
      logEvent(`Alt+${type[0].toUpperCase()}`, `TOGGLE_${type.toUpperCase()}`, getCurrentScreenId());
      applyOverlays();
    }
  }

  // Toggle all overlays
  function toggleAll() {
    const newVal = !(overlayState.fr && overlayState.nfr && overlayState.br && overlayState.uc);
    overlayState.fr = newVal;
    overlayState.nfr = newVal;
    overlayState.br = newVal;
    overlayState.uc = newVal;
    saveState();
    announce(`All overlays ${newVal ? 'enabled' : 'disabled'}`);
    logEvent('Alt+A', 'TOGGLE_ALL', getCurrentScreenId());
    applyOverlays();
  }

  // Open Traceability Dashboard
  function openDashboard() {
    logEvent('Alt+T', 'OPEN_DASHBOARD', getCurrentScreenId());
    if (typeof window.go === 'function') {
      window.go('trace');
    }
  }

  // Close all overlays
  function closeAll() {
    overlayState.fr = false;
    overlayState.nfr = false;
    overlayState.br = false;
    overlayState.uc = false;
    overlayState.log = false;
    saveState();
    const hintBar = document.getElementById('trace-hint-bar');
    if (hintBar) hintBar.style.display = 'none';
    const helpModal = document.getElementById('trace-help-modal');
    if (helpModal) helpModal.style.display = 'none';
    const detailDrawer = document.getElementById('trace-detail-drawer');
    if (detailDrawer) detailDrawer.style.display = 'none';
    const logDrawer = document.getElementById('trace-event-drawer');
    if (logDrawer) logDrawer.style.display = 'none';
    announce('All overlays closed');
    applyOverlays();
  }

  // Global Keyboard Event Listener
  window.addEventListener('keydown', (e) => {
    // Check if typing inside input/textarea/select unless Alt is pressed
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
    if (isInput && !e.altKey && e.key !== 'Escape') {
      return;
    }

    let combo = '';
    if (e.altKey) combo += 'Alt+';
    if (e.ctrlKey) combo += 'Ctrl+';
    if (e.shiftKey && e.key !== '?') combo += 'Shift+';
    combo += e.key;

    // Normalize
    const lowerKey = e.key.toLowerCase();
    const altCombo = 'Alt+' + lowerKey;

    if (e.key === 'Escape') {
      closeAll();
      return;
    }

    if (altCombo === 'Alt+h') {
      e.preventDefault();
      const bar = document.getElementById('trace-hint-bar');
      if (bar) {
        bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
        logEvent('Alt+H', bar.style.display === 'none' ? 'HIDE_HINT' : 'TOGGLE_HINT', getCurrentScreenId());
      }
      return;
    }

    if (altCombo === 'Alt+f') { e.preventDefault(); toggle('fr'); }
    else if (altCombo === 'Alt+n') { e.preventDefault(); toggle('nfr'); }
    else if (altCombo === 'Alt+b') { e.preventDefault(); toggle('br'); }
    else if (altCombo === 'Alt+u') { e.preventDefault(); toggle('uc'); }
    else if (altCombo === 'Alt+a') { e.preventDefault(); toggleAll(); }
    else if (altCombo === 'Alt+t') { e.preventDefault(); openDashboard(); }
    else if (altCombo === 'Alt+r') { e.preventDefault(); cycleRole(); }
    else if (altCombo === 'Alt+l') { e.preventDefault(); toggleLogDrawer(); }
    else if (altCombo === 'Alt+?' || altCombo === 'Alt+/' || (e.shiftKey && e.key === '?')) {
      e.preventDefault();
      toggleHelp();
    }
  });

  // Export overlay API to window
  window.TraceOverlay = {
    toggle,
    toggleAll,
    toggleHelp,
    toggleLogDrawer,
    cycleRole,
    openDashboard,
    closeAll,
    openDetail,
    applyOverlays,
    getCurrentScreenId,
    logEvent,
    getState: () => ({ ...overlayState })
  };

  // Initial setup when DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    ensureHintBar();
    setTimeout(applyOverlays, 300);
  });
})();
