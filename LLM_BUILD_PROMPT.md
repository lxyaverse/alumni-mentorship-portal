# PROMPT FOR CODING LLM — Alumni Mentorship Portal: Live Demo + Requirements Traceability Overlay

> Paste everything below the line into your coding LLM (Claude Code, Cursor, etc.) with the project folder open and the SRS (PDF/DOCX/text) attached.

---

## ROLE
You are a senior full-stack engineer. Upgrade the existing **Alumni Mentorship Portal** (CS314, Team T069, LNMIIT) into a **fully furnished, live-demo-ready** project, and add a **Requirements Traceability Overlay** that shows, on every screen of the prototype, which **Functional Requirements (FR), Non-Functional Requirements (NFR), Business Rules (BR) and Use Cases (UC, with primary actor)** are exercised there — toggled by keyboard shortcuts, and reflected live in a dashboard when shortcuts are pressed.

## EXISTING CODEBASE (do not rewrite from scratch — extend it)
- Node 18+, Express 4, `better-sqlite3` (SQLite, file `data/portal.db`), JWT auth, `bcryptjs`.
- `server.js` (REST API, RBAC, business rules), `db.js` (schema + seed), `public/{index.html,app.js,style.css}` (vanilla JS SPA), `api/index.js` + `vercel.json` (Vercel).
- Roles: `student`, `alumnus` (mentor), `coordinator`, `admin`. Demo accounts (password `demo123`): student@demo.com, mentor@demo.com, coord@demo.com, admin@demo.com, pending@demo.com.
- Server code already carries inline tags such as `// FR-016`, `// BR-004`, `// NFR-006`. Use them as a starting point, but the **SRS is the source of truth**.
- `DEMO=1` enables `POST /api/sessions/:id/fastforward`.

## STEP 0 — Read first, then report
1. Read all source files and the attached SRS completely.
2. Produce a short plan listing: gaps vs. SRS, files you will add/change. Then implement. Do not ask questions unless the SRS is contradictory.
3. Extract from the SRS into a single machine-readable file `data/requirements.json` (see schema below). **Never invent IDs or text** — if something is not in the SRS, omit it and list it under "Open questions" in your final report.

## PART A — Backend + SQLite integration (fully furnished)
1. **Schema (db.js)**: keep existing tables; add (with migrations that don't destroy data):
   - `requirements(id TEXT PK, type TEXT CHECK(type IN('FR','NFR','BR')), title, description, priority, category)`
   - `usecases(id TEXT PK, name, primary_actor, secondary_actors, preconditions, main_flow, alt_flows, postconditions)`
   - `screens(id TEXT PK, route, title, roles)` — one row per prototype view
   - `trace_links(screen_id, element_selector NULL, ref_type TEXT, ref_id TEXT, note)` — maps screen/element → FR/NFR/BR/UC
   - `shortcut_events(id, user_id NULL, role, key_combo, action, screen_id, ts)` — every overlay shortcut press is logged
   - Enable WAL, foreign keys, indexes on FKs and status columns.
2. **Seed**: `npm run seed` loads demo users, mentors across ≥6 domains, requests in every state (Pending/Accepted/Declined/Referred/Expired/Withdrawn), sessions (Scheduled/Completed/Cancelled), feedback, notifications, audit rows, **and** `requirements.json` + `trace_links`. Idempotent.
3. **New API** (all JWT-protected, role-checked server-side, input-validated, parameterized SQL only):
   - `GET /api/trace/requirements?type=&q=` · `GET /api/trace/usecases`
   - `GET /api/trace/screen/:screenId` → `{frs, nfrs, brs, usecases[{id,name,primaryActor}]}`
   - `GET /api/trace/matrix` → full requirement ↔ screen ↔ use case coverage matrix (+ uncovered requirements)
   - `POST /api/trace/event` → logs shortcut/overlay events
   - `GET /api/trace/events?limit=` (admin/coordinator) → live feed
   - `GET /api/trace/stream` → **Server-Sent Events** pushing new `shortcut_events` in real time to dashboard clients
4. Keep all existing routes working. Add consistent error shape `{error, code}`, request logging, graceful shutdown, `/api/health`.
5. Make remaining SRS items that the README lists as missing and are in-scope **optional but stubbed safely** (e.g., email as console/outbox table, not real SMTP). Add rate limiting + Helmet (NFR security) and an automated test suite (`node --test` + supertest or built-in fetch) covering each BR (BR-004/005/006/009/010/011/012/013/015 etc.) and RBAC.

## PART B — Requirements Traceability Overlay (the key feature)
Goal: during the live demo, the presenter presses a shortcut and the screen shows **exactly which requirements are in play right there**.

### B1. Annotation model
- Every view/component/button in `public/app.js` gets `data-screen="<screenId>"` and, where specific, `data-trace="FR-016,BR-001,UC-03"` attributes. Server `trace_links` is the canonical source; `data-trace` is a fallback.
- Screen IDs must cover **every** view for every role (login, register, mentor discovery, mentor profile, request form, my requests, sessions, feedback, notifications, mentor profile editor, requests inbox, schedule session, verification queue, reassignment, stats dashboard, users, categories, audit, traceability dashboard).

### B2. Keyboard shortcuts (global, work on every screen, ignored while typing in inputs unless prefixed with `Alt`)
| Shortcut | Action |
|---|---|
| `Alt+F` | Toggle **FR overlay** — badges/outlines (blue) on elements tied to Functional Requirements, each badge shows ID (e.g. `FR-025`); hover = title + description |
| `Alt+N` | Toggle **NFR overlay** (green) — security, performance, usability, etc. (show as a page-level chip bar + element badges, since NFRs are often cross-cutting) |
| `Alt+B` | Toggle **Business Rules overlay** (orange) — rule badges on elements where a BR is enforced; clicking shows the rule text + the server file/line that enforces it |
| `Alt+U` | Toggle **Use Case panel** — side panel listing UCs realised on the current screen with **Primary Actor**, secondary actors, pre/post-conditions, and which step of the main flow the current screen implements |
| `Alt+A` | Toggle **All overlays** |
| `Alt+T` | Open/close **Traceability Dashboard** (see Part C) |
| `Alt+?` or `Shift+/` | Show **Shortcut cheat-sheet** modal (this table, plus current role & screen ID) |
| `Alt+R` | Cycle demo role quick-switch (logs in as the next seeded demo account) — demo mode only |
| `Alt+L` | Toggle **Live event log** drawer |
| `Esc` | Close all overlays/panels |
- Shortcuts must be configurable in one `SHORTCUTS` object, avoid browser-reserved combos, and be listed in a persistent small hint bar ("Alt+? for shortcuts").
- Overlay state persists per session (`sessionStorage`) and is announced via `aria-live` (accessibility).
- A floating **legend** shows color ↔ type mapping and counts for the current screen (e.g. "FR 5 · NFR 3 · BR 4 · UC 2").
- Overlay must not break layout (use absolutely positioned badges / `outline`, `pointer-events` only on badges) and must work on mobile widths.

### B3. Use-case panel details
For each UC show: ID, name, **Primary Actor** (highlight whether it matches the logged-in role), secondary actors, trigger, preconditions, the main-flow steps with the **current step highlighted**, alternate flows relevant to this screen, postconditions, and linked FR/BR chips (clickable → jumps to requirement detail).

### B4. Click-through
Clicking any badge opens a requirement drawer: ID, type, title, full SRS text, priority, linked screens, linked use cases, and "enforced at" (API route + file:line for BRs/NFRs — generate this map by scanning `// FR-xxx|BR-xxx|NFR-xxx` comments in server code at startup).

## PART C — Dashboard that reacts to shortcuts
Add a **Traceability Dashboard** screen (`Alt+T`, also in nav for admin/coordinator):
1. **Live shortcut feed** — every shortcut press (who, role, key combo, action, screen) appears instantly via SSE; flash animation on new row.
2. **Cards**: total FR/NFR/BR/UC; % covered by at least one screen; requirements pressed/viewed in this session; most-inspected requirements.
3. **Coverage matrix**: rows = requirements, columns = screens (or UCs), filled cells = linked; filter by type, role, priority; uncovered requirements highlighted red.
4. **Use-case table**: UC → primary actor → screens where used → roles able to reach it.
5. **Current-screen mini-panel** mirrored from the main app: when the presenter presses `Alt+F/N/B/U`, the dashboard (if open in a second window/tab) updates its "Now showing" tile in real time (use `BroadcastChannel` for same-browser tabs + SSE for cross-device).
6. Export: CSV / JSON of the matrix (`Alt+E`). Print-friendly view for the report appendix.
7. Charts via a lightweight CDN-free approach (inline SVG/canvas) so it works offline.

## PART D — Live demo readiness
1. **One-command run**: `npm install && npm start` works on Windows/macOS/Linux; auto-creates + seeds DB if missing; prints URL and demo credentials.
2. **Demo mode** (`DEMO=1`): fast-forward sessions, role quick-switch, "Reset demo data" button (`POST /api/demo/reset`, demo only).
3. **Public live URL**: provide working deployment config for **Render or Railway (persistent disk for SQLite)** as primary; keep Vercel config as a stateless fallback (explain `/tmp` is ephemeral and the seed re-runs on cold start). Include `Dockerfile`, `.dockerignore`, `render.yaml`, health check, `PORT`/`JWT_SECRET` env handling, and a step-by-step `DEPLOY.md`.
4. **Demo script** `DEMO_SCRIPT.md`: a 7-minute walkthrough per role, listing at each step which shortcut to press and which FR/NFR/BR/UC the audience will see.
5. UI polish: consistent design system, empty/loading/error states, toasts, form validation messages, responsive layout, keyboard-accessible, WCAG AA contrast, favicon, meaningful page titles.

## `data/requirements.json` schema
```json
{
  "requirements": [{"id":"FR-016","type":"FR","title":"","description":"","priority":"High|Medium|Low","category":""}],
  "usecases": [{"id":"UC-01","name":"","primaryActor":"Student","secondaryActors":["System"],"preconditions":[],"mainFlow":[{"step":1,"text":"","screen":"mentor-discovery"}],"altFlows":[],"postconditions":[],"relatedFR":[],"relatedBR":[],"relatedNFR":[]}],
  "screens": [{"id":"mentor-discovery","route":"#/mentors","title":"Find your mentor","roles":["student"]}],
  "links": [{"screen":"mentor-discovery","selector":"#search-input","type":"FR","id":"FR-016","note":""}]
}
```
IDs/titles/text must come verbatim from the SRS. Validate on load: every `links[].id` exists; every requirement is linked to ≥1 screen **or** flagged "backend-only"/"not in prototype".

## ACCEPTANCE CRITERIA (verify and report each)
- [ ] `npm test` passes; ≥1 test per business rule and per role-based access rule.
- [ ] Fresh clone → `npm install && npm start` → app + seeded SQLite working with no manual steps.
- [ ] On **every** screen, `Alt+F`, `Alt+N`, `Alt+B`, `Alt+U` show correct, non-empty (or explicitly "none on this screen") traceability; `Alt+?` lists all shortcuts.
- [ ] Use-case panel shows the **primary actor** for every UC and highlights the current main-flow step.
- [ ] Pressing any shortcut produces a row in the dashboard live feed within 1 s (SSE) and a row in `shortcut_events`.
- [ ] Coverage matrix shows 100% of FR/NFR/BR/UC from the SRS with uncovered ones listed.
- [ ] No hardcoded secrets; `.env.example` updated; all SQL parameterized; RBAC enforced server-side on new routes.
- [ ] Deployed live URL works (or exact deploy steps + config verified locally via Docker).
- [ ] README updated (features, shortcuts table, architecture diagram, API list, test + deploy instructions).

## CONSTRAINTS
- Keep stack: Node/Express/better-sqlite3/vanilla JS. No heavy frontend framework, no external CDN dependencies for core features.
- Do not break existing endpoints or seeded demo accounts.
- Work in small, verifiable commits; run the app and tests after each part; fix before moving on.
- Final report: files changed, how to run, shortcut table, requirement coverage numbers, open questions/assumptions.
