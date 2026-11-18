# Alumni Mentorship Portal

**CS314 Software Development Laboratory · Team T069**  
**The LNM Institute of Information Technology, Jaipur**

The Alumni Mentorship Portal is a web-based platform that connects current students with verified alumni for structured, trackable mentorship. This prototype features full end-to-end capabilities across all four user classes (**Student**, **Alumnus/Mentor**, **Alumni Relations Coordinator**, **Administrator**) and includes a built-in **Requirements Traceability Overlay** that visualizes SRS alignment in real time on every screen.

---

## Team & SRS Contributions

| Name | Roll number | Primary SRS contribution |
|---|---|---|
| **Lakshya Mittal** | 24UCS140 | User classes, system context, functional requirements FR-001–FR-023, business rules |
| **Aakansha Garg** | 24UCS141 | Non-functional requirements, data requirements, mentorship lifecycle, major use cases |
| **Sumit Sharma** | 24UCS142 | Requirements traceability, validation, quality criteria, change management, versioning |
| **Tanishka Khandelwal** | 24UCS143 | Detailed use cases, user stories, acceptance criteria, requirements prioritization |

---

## Live Demo & Requirements Traceability Overlay

The portal includes an interactive **Requirements Traceability Overlay** allowing presentation evaluators and users to see which Functional Requirements (FR), Non-Functional Requirements (NFR), Business Rules (BR), and Use Cases (UC) are realized on every prototype screen.

### Global Keyboard Shortcuts

| Shortcut | Action | Description |
|---|---|---|
| <kbd>Alt+F</kbd> | Toggle **FR Overlay** | Badges and outlines (blue) for Functional Requirements; hover for summary |
| <kbd>Alt+N</kbd> | Toggle **NFR Overlay** | Page-level bar and element chips (green) for security, performance, privacy, etc. |
| <kbd>Alt+B</kbd> | Toggle **BR Overlay** | Business rule badges (orange) + click to inspect server file/line enforcement |
| <kbd>Alt+U</kbd> | Toggle **Use Case Panel** | Side panel showing active Use Case, Primary Actor match, and current step highlight |
| <kbd>Alt+A</kbd> | Toggle **All Overlays** | Turns all overlays on or off simultaneously |
| <kbd>Alt+T</kbd> | **Traceability Dashboard** | Opens full coverage matrix, live shortcut event feed, and charts |
| <kbd>Alt+R</kbd> | **Cycle Demo Role** | Instant hotkey to cycle accounts: Student ⇄ Mentor ⇄ Coordinator ⇄ Admin |
| <kbd>Alt+L</kbd> | **Live Event Log Drawer** | Opens side drawer displaying shortcut execution history |
| <kbd>Alt+?</kbd> or <kbd>Shift+/</kbd> | **Shortcuts Cheat-Sheet** | Displays the full shortcut table and active screen ID modal |
| <kbd>Esc</kbd> | **Close All** | Dismisses all drawers, panels, and modals |

---

## Seeded Demo Accounts (Password: `demo123`)

| Role | Email | Capabilities to Demonstrate |
|---|---|---|
| **Student** | `student@demo.com` | Mentor discovery, search/filter, request submission, feedback, sessions |
| **Alumnus (Mentor)** | `mentor@demo.com` | Profile editing, request inbox (accept/decline/refer), scheduling sessions |
| **Coordinator** | `coord@demo.com` | Alumni verification queue, referred request reassignment |
| **Administrator** | `admin@demo.com` | User management & deactivation, category management, system audit log |
| **Pending Alumnus** | `pending@demo.com` | Demonstrates pending verification state (unverified alumnus) |

---

## Architecture & System Context

```text
Browser Client (public/ SPA: app.js, overlay.js, style.css)
        │  ▲
        │  │ REST API & Server-Sent Events (SSE /api/trace/stream)
        ▼  │
Express REST Server (server.js — RBAC, Business Rules, Rate Limiting, Helmet)
        │
        ▼
SQLite Database (db.js / data/portal.db — WAL mode, Foreign Keys, Parameterized SQL)
```

- **Traceability Data Source:** `data/requirements.json` verbatim extracted from SRS v1.0.
- **Enforcement Scanner:** Server automatically scans `server.js` comments (`// FR-xxx`, `// BR-xxx`) at startup to provide exact file and line references when clicking badges.
- **Real-Time Push:** Shortcut presses trigger `POST /api/trace/event` and broadcast across open windows using `BroadcastChannel` and `Server-Sent Events` (SSE).

---

## Requirements Coverage Summary (SRS v1.0 Baseline)

| Requirement Type | Total in SRS | Total in Database | Coverage % |
|---|:---:|:---:|:---:|
| **Functional Requirements (FR)** | 61 (FR-001..FR-061) | 61 | **100%** |
| **Non-Functional Requirements (NFR)** | 24 (NFR-001..NFR-024) | 24 | **100%** |
| **Business Rules (BR)** | 18 (BR-001..BR-018) | 18 | **100%** |
| **Major Use Cases (UC)** | 20 (UC-001..UC-020) | 20 | **100%** |

Full coverage matrix is accessible at runtime via `/api/trace/matrix` or the **Traceability Dashboard** (`Alt+T`).

---

## Getting Started

### 1. Prerequisites
- Node.js 18+ (tested on Node 18, 20, 22)
- npm 9+

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Application
```bash
# Production / Normal mode
npm start

# Or with DEMO mode enabled (enables session fast-forwarding & role cycling):
npm run dev
```

The portal automatically creates and seeds `data/portal.db` if missing.  
Open **http://localhost:3000** in your web browser.

### 4. Run Automated Test Suite
```bash
npm test
```
Runs 20 automated tests verifying each Business Rule (`BR-001` through `BR-018`), server-side RBAC, JWT validation, and the Traceability API.

### 5. Reset Seed Data
```bash
npm run seed
```

---

## Deployment Instructions

Detailed deployment documentation is provided in [`DEPLOY.md`](./DEPLOY.md).

- **Render / Railway (Recommended):** Use persistent disk mounted at `/app/data` with Dockerfile or `render.yaml`.
- **Local Docker:**
  ```bash
  docker build -t alumni-mentorship-portal .
  docker run -p 3000:3000 -v "$(pwd)/data:/app/data" -e DEMO=1 alumni-mentorship-portal
  ```
- **Vercel:** Stateless deployment configured via `vercel.json` (runs against ephemeral `/tmp/portal.db`).

---

## Demo Presentation Guide

Follow the step-by-step walkthrough in [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) for a complete 7-minute presentation covering student, mentor, coordinator, and administrator flows with shortcut timestamps.
