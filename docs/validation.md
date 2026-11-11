# Verification record

Verified on the supplied Node.js 24 cloud workspace. All automated checks used local fictional fixtures; no real student data, Enterprise tenant or Jira account was accessed.

| Check                                                       | Result        | Evidence                                                                         |
| ----------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------- |
| Vitest policy, authenticated workflow and Jira adapter      | PASS: 18/18   | `npm test`; 3 test files                                                         |
| Production build and TypeScript                             | PASS          | `npm run build`; Next.js 16.4.5, all five routes compiled                        |
| Browser UI → API → SQLite → UI                              | PASS          | Chromium smoke via `node tests/browser-smoke.mjs`                                |
| False all-clear                                             | PASS          | Actual lab health 200, query 503; no eligible recovery checks                    |
| Real recovery                                               | PASS          | Two actual HTTP query 200 responses with expected reply, separated by 5+ seconds |
| Independent reviewer → operator closure                     | PASS          | Final incident Resolved; receipt labeled Local demo update                       |
| Approval replay                                             | PASS          | One action.result audit event after replay                                       |
| Browser reload                                              | PASS          | Resolved status and receipt persisted in SQLite                                  |
| Mobile layout                                               | PASS          | 390px viewport, no horizontal document overflow                                  |
| Browser runtime errors                                      | PASS          | Zero pageerror events                                                            |
| Unknown citation, stale bundle                              | PASS          | Rejected in policy tests                                                         |
| Unauthorized reviewer, superseded approval, stale evidence  | PASS          | Rejected in route integration tests                                              |
| Jira permission error, reconciliation, destination mismatch | PASS on mocks | Jira adapter tests; not an external sandbox check                                |
| Gemini Enterprise real tenant run                           | PENDING       | Organizer tenant required                                                        |
| Jira sandbox write/read-back                                | PENDING       | Dedicated sandbox credentials and allowlist required                             |
| Shared Postgres workflow                                    | PASS          | Live protected browser journey persisted state and one action in Neon            |

## Vercel deployment

- Project: fixpilot-ai; team shayantkhan548-3831s-projects. Node.js 24.x; production build reached READY.
- URL: https://fixpilot-ai-kappa.vercel.app
- Dedicated Neon resource: fixpilot-db, free_v3 (Free), region iad1; connected to this project.
- Full demo workflows are enabled with FIXPILOT_PREVIEW=0, a persistent database, and server-issued signed sessions. Vercel sign-in protection covers all deployments and domains at the user's request; unauthenticated access returns HTTP 302 to sign-in.
- The actual protected browser → API → Neon → UI journey passed: false all-clear blocked, two real successful query checks, separate reviewer approval, operator execution, one action after replay, persisted state after reload, and mobile layout without overflow.
- The cloud proxy's CA is trusted by Node. Hosted browser testing used a Node transport for page requests with upstream TLS verification enabled, plus an authenticated proxy for API requests. No generic TLS verification bypass was used.
- Private automation access was used for testing and same-app lab probes. The server only sends its managed credential to APP_ORIGIN. A policy/integration test verifies it is absent when the lab host differs.
- The temporary test sessions and test access credential were rotated. No credentials were added to the source or displayed in the UI. Use the documented disposable demo password. It is configured server-side and the login field supports Show/Hide.
- Original fixtures are reset after acceptance testing. Jira remains Local demo update; no real Jira sandbox transition or Enterprise tenant execution is claimed.

## Repeat the local browser check

Start from a fresh seeded app (`npm run seed`, then `npm start` after a build). The smoke script uses Chromium at `/usr/bin/chromium` by default; override CHROMIUM_PATH for your platform. It uses only disposable demo accounts. It records screenshots and a JSON result under work/. It requires a clean case; stop the server before reseeding. The five-second wait is the real recovery separation under test, not a shortened policy.

Automated run duration is not hands-on operator time. No human baseline, reviewer wait or savings percentage has been measured. Collect those in the organizer rehearsal as described in demo-script.md.

## Login regression check

`npm run test:login` verifies Show/Hide preserves the entered text without submitting, a wrong-password message survives the old five-second polling interval, and both operator and reviewer can sign in. This targeted Chromium check passed against the production build. Normal signed-out page loading no longer displays a spurious Sign in required message. The protected demo password has been reset to the documented disposable value.

## Coordination expansion

The user/staff portal adds persisted reports, incidents, routing, owner, severity, ETA, shared updates and user confirmations to the existing database aggregate. Rule grouping and permissions are covered by automated tests. A local browser check passed report intake, grouping, shared feed, staff publishing, navigation hover/pin and mobile overflow. Counts and ratios come from stored records. No real campus monitoring, historical logs, email delivery, calibrated diagnosis accuracy or time savings are claimed.

