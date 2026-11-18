# Live Presentation Demo Script (7-Minute Walkthrough)

**Project:** Alumni Mentorship Portal (CS314 Software Development Lab, Team T069)  
**Evaluator/Audience:** Faculty Evaluator, Project Reviewers, Students  
**Feature Focus:** Live prototype workflow paired with the **Requirements Traceability Overlay**

---

## Pre-Demo Setup (30 Seconds)
1. Ensure the server is running with `DEMO=1 npm start` on `http://localhost:3000`.
2. Open two browser windows side by side:
   - **Window A (Presenter View):** `http://localhost:3000` (Main SPA prototype)
   - **Window B (Audience Dashboard View):** `http://localhost:3000` (logged into Admin or Coordinator, navigated to **Traceability Dashboard** via `Alt+T`).

---

## Phase 1: Authentication & Overlay Overview (Minute 1:00)
- **Actor:** Evaluator / Presenter (Unauthenticated / Landing screen)
- **Actions in Window A:**
  1. Open `http://localhost:3000`. Show the landing hero and role login tiles.
  2. Press **`Alt+?`** (or `Shift+/`). The **Keyboard Shortcuts Cheat-Sheet Modal** appears showing:
     - `Alt+F` (Functional Requirements)
     - `Alt+N` (Non-Functional Requirements)
     - `Alt+B` (Business Rules)
     - `Alt+U` (Use Case Flow Panel)
     - `Alt+R` (Cycle Demo Role)
     - Active screen ID: `login-register`.
  3. Press **`Alt+F`**. Notice the blue badges and element highlights appear on email/password fields (`FR-004`), registration fields (`FR-001`, `FR-002`), and session termination (`FR-007`).
  4. Press **`Alt+U`**. The side panel reveals **UC-001** (*Register Account*) and **UC-003** (*Login*), showing the Primary Actor as **All users** and step 1 highlighted.
  5. **Look at Window B (Dashboard):** Point to the **Live Presentation Shortcut Feed** — notice the rows for `Alt+?`, `Alt+F`, and `Alt+U` popped up instantly via Server-Sent Events (SSE) with flash highlights!

---

## Phase 2: Student Mentorship Discovery & Request (Minute 2:00 - 3:30)
- **Actor:** Student (`student@demo.com`)
- **Actions in Window A:**
  1. Click **Student** demo button to log in. You land on **Find your mentor** (`mentor-discovery`).
  2. Press **`Alt+F`** and **`Alt+B`**:
     - `FR-019` badges the keyword search box.
     - `FR-020` badges the domain & availability dropdowns.
     - `FR-021` badges the sort dropdown.
     - `BR-002` and `BR-016` badge the mentor cards (only verified alumni visible; no personal contact details).
     - `BR-015` badges the aggregate rating (`★ not enough ratings yet` displayed when < 3 reviews).
  3. Click any **`BR-015`** or **`FR-019`** badge directly. The **Requirement Drawer** opens showing:
     - Full SRS specification text verbatim.
     - **"Enforced At"**: server file and line number scanned live from `server.js`!
  4. Press **`Alt+U`**. Side panel displays **UC-007** (*Browse and Search Mentors*) and **UC-009** (*Send Mentorship Request*), confirming **Primary Actor: Student (Your Role ✓)** with Step 1 highlighted: `◀ YOU ARE HERE`.
  5. Search for `Google` or filter by `Machine Learning`. Click **Request mentorship** on Rohit Verma (`request-form`).
  6. On the request form, press **`Alt+F`** & **`Alt+B`**:
     - `FR-025` badges the required topic, message, and slot inputs.
     - `BR-004` (duplicate prevention) and `BR-005` (max 3 pending requests) are displayed as active business rules.
  7. Fill in:
     - Topic: `System Design Coaching`
     - Message: `Preparing for placement drives in distributed systems.`
     - Slot: `Sunday 5 PM IST`
  8. Click **Submit Request**. Toast confirms request creation, redirecting to **My Requests** (`my-requests`, realizing `FR-029`).

---

## Phase 3: Mentor Request Review & Scheduling (Minute 3:30 - 5:00)
- **Actor:** Alumnus / Mentor (`mentor@demo.com`)
- **Actions in Window A:**
  1. Press **`Alt+R`** (or click Switch to Mentor). System switches session instantly to Rohit Verma (`m1`).
  2. Open **Request Inbox** (`request-inbox`).
  3. Press **`Alt+F`** and **`Alt+B`**:
     - `FR-030` badges the request inbox.
     - `FR-032` badges the **Accept** button.
     - `BR-006` (mentoring capacity constraint) and `BR-009` (mandatory decline reason) are outlined.
  4. Press **`Alt+U`**. Side panel updates to **UC-012** (*Respond to Mentorship Request*), Primary Actor: **Alumnus (Mentor) (Your Role ✓)**, with Accept/Decline/Refer steps.
  5. Click **Accept**. The request transitions to `Accepted` (`FR-038` creates mentorship record).
  6. The session scheduling form appears below the accepted request:
     - Press **`Alt+B`**: `BR-010` (scheduled only against accepted request) and `BR-011` (date/time must be in the future).
     - Date: `2026-11-25`, Time: `18:00`, Dur: `60 min`, Link: `https://meet.google.com/lnm-demo-meet`.
     - Click **Schedule Session** (`FR-039`, `UC-015`).
  7. Click the demo button **⚡ Fast-Forward Time** on the scheduled session to simulate session completion.
  8. Click **Mark Completed** (`FR-044`, `BR-012`, `UC-017`). The session transitions to `Completed`.

---

## Phase 4: Student Feedback & Aggregate Rating Update (Minute 5:00 - 6:00)
- **Actor:** Student (`student@demo.com`)
- **Actions in Window A:**
  1. Press **`Alt+R`** to cycle back to **Student**.
  2. Navigate to **My Sessions** (`my-sessions`).
  3. Notice the completed session now offers **Give Feedback (WF-07)** (`FR-046`, `BR-013`, `UC-018`).
  4. Click **Give Feedback**. You are on `session-feedback`.
  5. Press **`Alt+F`**, **`Alt+N`**, **`Alt+B`**:
     - `BR-014`: Rating selector enforces integer 1 to 5.
     - `FR-050` / `NFR-022`: Feedback privacy notice shown ("Comments are confidential, never published publicly").
  6. Select **★★★★★ 5 - Excellent**, enter comment `Exceptional mentor!`, and click **Submit Feedback**.
  7. Toast confirms feedback saved!
  8. Return to **Find Mentors**. Notice Rohit Verma's aggregate rating now shows **★ 4.7 / 5.0** because 3 feedback entries now exist, satisfying **BR-015**!

---

## Phase 5: Coordinator Verification & Traceability Dashboard (Minute 6:00 - 7:00)
- **Actor:** Coordinator (`coord@demo.com`) / Admin (`admin@demo.com`)
- **Actions in Window A:**
  1. Press **`Alt+R`** to switch to **Coordinator**.
  2. Show **Alumni Verification Queue** (`verification-queue`, `FR-003`, `FR-058`, `UC-002`). Show pending alumnus Pankaj Jain. Click **Verify** (`NFR-023` logged in audit).
  3. Press **`Alt+T`** (or click **Traceability Dashboard** in top navigation).
  4. Showcase the **Traceability Dashboard** in full screen:
     - **Summary Cards:** 61 FRs (100% covered), 24 NFRs (100% covered), 18 BRs (100% covered), 20 Major Use Cases.
     - **Category Breakdown Chart:** Pure inline SVG visualization (no CDN dependencies, 100% offline).
     - **Traceability Matrix Table:** Cross-referencing every single SRS requirement ID against prototype screens, priority, and server code implementation.
     - **Export:** Click **Export CSV** or **Export JSON** to demonstrate downloadable verification artifacts.
  5. Conclude the demonstration by answering evaluator questions.
