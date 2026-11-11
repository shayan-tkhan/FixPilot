# FixPilot AI

Live demo: [FixPilot public demo](https://fixpilot-public-demo.vercel.app/operations).

This repository contains the recovered application source and the updates published on 11 November 2026. Deployment configuration, database records, uploaded evidence and server secrets are managed separately in Vercel; they are not included in this repository.

## Current demo features

- Student, technician, department staff and administrator dashboards, with monthly statistics below the main dashboard.
- APU campus and residence location maps, issue status colors and technician assignment scope.
- Twelve department technicians, staff assignment/transfer, duplicate linking, repair approval and student confirmation/reopening.
- Six-step guided walkthrough that works without AI credits, with clearly labeled scripted triage and illustrative before/after evidence. It does not modify saved reports.
- Separate read-only presentation mode with 150 fictional incidents: 40 active, 92 resolved, 18 confirmed, including 8 critical active incidents.
- Response countdowns using the existing 24-hour reminder and 48-hour reassignment rules, chronological issue/evidence timelines, and mobile report controls with upload progress/retries.
- Advisory AI intake and description/media comparison when provider access is available. Live AI currently requires Vercel account verification; unavailable calls leave manual reporting and staff review available. No confidence percentages or repair success are fabricated.

Latest verification: 83 automated tests passed, along with the production TypeScript/Next.js build and targeted browser checks. Demo names and reports are fictional. See [release checks](docs/release-checks.md).

University issue reporting and resolution for students, department staff, and technicians. Built with Next.js, TypeScript, private attachments, and PostgreSQL on Vercel (SQLite locally). Role dashboards support a human-reviewed repair lifecycle, with advisory AI intake/routing and optional push updates. Manual reporting works independently of AI availability.

## Basic university workflow

Every role opens on a shared dashboard layout: actionable colored summary cards, quick access, progress/workload, a personal work queue, and recent activity. Counts and actions reflect the signed-in role; technicians only see assigned tasks.

The default `/operations` experience has three roles:

1. **Student/User:** submit a category, title, description, location and private image/video/PDF attachments. Track personal issues, receive in-app updates, and confirm a repair or reopen the same issue.
2. **Department Staff:** review issues, assign/transfer to a department and technician, manually merge duplicates, and approve or return completed repairs.
3. **Technician:** see assigned tasks only, start work, upload before/after photos, post updates or request help, and submit a repair for review. A repair photo, video, or completion note of at least 10 characters is required.

Category selection routes issues using configured department rules. Matching suggestions never merge reports automatically: reporters choose to join an existing issue, or staff explicitly merge duplicates. Staff can override AI-suggested routing and priority. Monitoring and quiet-window checks are not part of the repair workflow. The older technical lab remains a separate legacy demo at `/?evidence=1` and is absent from the normal navigation.

Demo accounts use `demo123`:

| Role | Account | Name / TP |
| --- | --- | --- |
| Student | reporter@fixpilot.demo | Jamie Lee · TP000001 |
| Student | reporter2@fixpilot.demo | Noor Aziz · TP000002 |
| Department Staff | reviewer@fixpilot.demo | Sam Chen |
| Backup Reviewer | reviewer2@fixpilot.demo | Priya Nair |
| Technician | operator@fixpilot.demo | Alex Morgan |
| Backup Technician | technician2@fixpilot.demo | Riley Tan |
| Admin | admin@fixpilot.demo | Taylor Reed |

Names and TP numbers are fictional profile data. Staff see a reporter identity block for every linked report; submitted identity fields are ignored. A real rollout needs university SSO and managed departmental memberships. Push is opt-in and browser dependent; email/SMS are not connected.


## Windows PowerShell setup

Install Node.js 24 LTS. In this directory:

```powershell
npm ci
Copy-Item .env.example .env.local
# Replace SESSION_SECRET in .env.local with a random value (32+ characters).
# The built-in password is only for a disposable localhost demo.
npm run seed
npm run dev
Start-Process http://localhost:3000
```

The seed command uses `.data/fixpilot.sqlite`; if you change FIXPILOT_DB in `.env.local`, also set `$env:FIXPILOT_DB` before seeding. Node does not load `.env.local` for the standalone seed script. Stop the app before reseeding. Without a configured secret, localhost creates a process-local random signing key and sessions expire on restart. Set a stable SESSION_SECRET for cross-process sessions.

| Account                | Role     | Default disposable password |
| ---------------------- | -------- | --------------------------- |
| operator@fixpilot.demo | Operator | demo123         |
| reviewer@fixpilot.demo | Reviewer | demo123         |

Sign out to switch roles, or use a second browser profile. The server enforces roles independently of disabled buttons. Change DEMO_PASSWORD before exposing the app on a shared host. Cookie sessions are signed, HTTP-only, SameSite Strict, and Secure on HTTPS. Mutations reject other origins. Default lab destinations and payloads are server controlled.

```powershell
npm test
npm run build
npm start
```

## Legacy technical lab workflow

1. Accept links for HELP-1041–1043; keep the account-specific and LMS reports separate. Originals remain preserved.
2. Export the current versioned investigation bundle. Run the two-node Enterprise workflow described in `docs/gemini-enterprise.md`, review its JSON, and import it as **Enterprise manual import**. Until tenant access is available, use **Use a labeled fixture for the demo**. This explicitly imports **Fixture** analysis.
3. Open Demo lab. In False all-clear, Run recovery check returns health 200 and query 503. Closure remains blocked.
4. Select Recovered. Run two checks at least five seconds apart. Query status must be 200 with the expected marker. Both must be less than two minutes old, after the incident started and the latest failed query.
5. Sign in as the reviewer. Approve the exact current revision and displayed probe IDs. Sign back in as the operator and apply the approved action.
6. In local mode the outcome says **Local demo update**. The audit receipt records reviewer, target, probes and action key. Replaying the same approved key reuses its recorded outcome.

Any probe, link, scenario or analysis mutation increments the case revision and invalidates an earlier approval. Scenario changes conservatively invalidate approval. Probes are original observations and cannot be entered manually. Monitoring and runbook sources are fixtures, lab probes are actual HTTP checks. Analysis is read-only and cannot transition issues.

## Storage & architecture

- `app/api/`: typed route handlers for sessions, state, ticket sync, bundle export, analysis import, link review, lab scenarios, probes, approvals and execution.
- `lib/incidents/`: import contract, evidence citations, correlation and closure rules.
- `lib/db/`: versioned SQL migration, SQLite adapter, seed and append-only application audit. Ticket, incident, link, evidence, analysis, approval and current action records are stored in the single JSON aggregate `state`; reserved actions and audit events have separate tables. Source ticket content is never overwritten by analysis. This compact aggregate is suitable for this single-case MVP; a multi-incident product needs normalized case tables.
- `lib/jira/`: configured-key reads, project validation, transition discovery, write and read-back.
- `docs/`: integration setup, demo script and validation report.

Mutations are serialized locally. When configured for Vercel, a Postgres transaction and advisory lock serialize case mutations across instances; unique action keys reserve external writes. A crash after an external write requires reconciliation, never a blind retry. A timed-out or denied transition remains Unconfirmed. An already-resolved external issue is recorded separately and does not imply the app performed a transition. Local action verification is a deterministic persisted stand-in, not a Jira claim.

## Jira sandbox configuration

Use a dedicated disposable sandbox account and a pre-created parent issue. Set the JIRA_* variables in `.env.local` using `.env.example`. JIRA_MODE must explicitly equal `sandbox`. Allowed keys are a comma-separated allowlist including the parent. Project key must match every read. Sync imports preserve Jira source keys, ADF text and browse links; unclassified Jira tickets are conservatively marked Review required. The five seeded fixtures demonstrate correlation; automated ADF service/signature classification is outside this MVP.

Confirm transition and destination status IDs for the parent in your sandbox. The adapter retrieves `/rest/api/3/issue/{key}/transitions`, validates both IDs, posts the approved transition, re-reads the issue and confirms the expected status ID. It never writes a child report. No Jira credentials were supplied for this build: only local mocked tests have run. Validate actual account permissions and read-back in the sandbox before presenting a verified Jira demo.

## Vercel deployment

SQLite under `.data/` is for the local app. Vercel functions have no durable writable local disk. **Never use /tmp as the incident database.** The included optional Postgres adapter is for a shared Vercel deployment; it replaces SQLite there, retaining one app and one database.

1. Create a Vercel project using this source, framework Next.js and Node.js 24.x.
2. Provision a managed Postgres database. Set DATABASE_URL, a strong SESSION_SECRET and a new DEMO_PASSWORD using Vercel environment settings, never client-prefixed variables. Tables are created idempotently on the first database request. Use a pooler connection URL for serverless hosting. Integration provisioning, production concurrency and recovery still need validation against the selected database.
3. For protected same-app HTTP probes, set APP_ORIGIN to the production app origin and configure Vercel's server-managed automation credential. The app sends it only to that exact origin. Alternatively set LAB_BASE_URL to a dedicated controlled lab; the Vercel credential is never sent there. Keep the lab isolated from real student infrastructure.
4. Keep JIRA_MODE=local until the sandbox credentials and project allowlist are configured and reviewed.
5. Deploy and repeat the browser smoke journey. Do not claim durable incident recovery without a configured external database and its successful integration checks.

Deployment requires access to the intended Vercel team. No external database is provisioned by running this app locally.

## Checks & limits

See `docs/validation.md` for observed checks. Enterprise tenant execution, Jira sandbox permissions and shared Postgres verification require their respective authorized accounts. A team-owned Drive runbook is optional; this build uses a versioned, local read-only fixture. This is a controlled hackathon demo, not a production identity or incident-management service.

## Deployments and isolation

- Public demo: https://fixpilot-demo.milkyfrog13.chatgpt.site — FixPilot sign-in only, no hosting-provider login.
- Protected workspace: https://fixpilot-ai-kappa.vercel.app — Vercel authentication remains enabled.

The public front door is deployed through Sites and forwards only approved application routes to a separate demo backend. It verifies browser origins before forwarding writes. The demo backend uses its own random SESSION_SECRET and the `fixpilot_public_demo` PostgreSQL schema; the original workspace uses `public`. Schema names are server-controlled, validated and quoted. No private workspace records or uploads are copied to the demo. Each new demo database starts with explicitly fictional samples. The source front door and its exact Site ID are under `sites/fixpilot-demo/.openai/hosting.json`.

## Workflow safeguards

- Report submission is limited atomically to 10 new reports per account per Malaysia calendar day; reopening does not create a new report.
- Department transfer requires a reason and preserves the original report and update history.
- Any staff reviewer can claim an unclaimed case. Concurrent claims serialize; another reviewer must explicitly take over with a reason before editing. Transfers release the claim to the destination queue.
- Assignment reminders use Vercel Workflow durable timers: 24 hours without response records a reminder; 48 hours reassigns to the available demo backup technician. If the backup also ignores the task, it returns to the department queue. Assignment tokens invalidate timers after manual reassignment, transfer, work response or reopening. Overdue badges use actual stored assignment times.
- Completion requires an assigned technician and photo/video evidence or a substantive note. Staff approval is separate and mandatory. The case closes only after all linked reporters confirm; “Still not fixed” reopens the same case.
- In-app notifications are persisted with each change. Opt-in Web Push uses private VAPID keys, a leased outbox, per-device delivery tracking and expired-endpoint cleanup. Push content omits issue details on lock screens. Browser permission and device support are required.

## AI assistance

`/api/assist` uses AI SDK structured outputs through Vercel AI Gateway with a catalog-verified vision model. Features include photo-only or multilingual intake, editable title/category/priority drafts, staff routing and duplicate suggestions, and technician update drafts. AI cannot assign, merge, approve or close a repair. It cannot infer network speed from a generic room image. Missing locations stay empty for user confirmation, observations remain visible, and no numerical accuracy/confidence metric is fabricated. Original submitted wording is retained server-side for assisted reports.

AI attempts are limited to 20 per account per 24 hours. Invalid image types, oversized files and unauthorized case access are rejected before model invocation. Staff suggestions are marked stale if the issue changes during analysis. Provider failures leave the manual form and existing case unchanged.

**Current activation limit:** live Gateway requests returned `403 customer_verification_required`: the owner must add a valid card to unlock Gateway credits. The application integration and error handling are implemented, but live AI generation has not passed verification. Model tests use explicit mocks; they are not proof of real-provider output.

## Evidence and validation

Images, screenshots, MP4/WebM and PDF attachments are private. Each file is limited to 3 MB and each account can attach nine files per report. Before/after repair evidence remains available for review. Local development uses `.data/uploads`; hosted deployments use private Vercel Blob. The public demo cannot retrieve private-workspace attachments because its report metadata lives in a separate schema.

Validation: 43 unit/integration tests pass. Browser checks cover all role dashboards, mobile layouts, identity display, department transfer, two reporters joining one issue, reviewer takeover, note-only completion, mandatory staff approval, reporter confirmation and reopening. The public URL was tested anonymously and through a rendered browser login, dashboard and reviewer detail page. A real hosted Workflow run was accepted and logged its assignment timer start. Push outbox behavior is tested with a mocked push service; physical-device delivery requires an opted-in browser.

The private editable Figma workspace remains https://www.figma.com/design/GOSRL7j9gKT6i9MuQeZVnl .
