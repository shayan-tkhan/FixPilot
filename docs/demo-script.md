# Three-minute demo script

Prepare two browser profiles signed in as operator and reviewer. Seed a clean local app. For a live Enterprise run, have the organizer tenant workflow ready and allow additional model execution time; the three-minute script uses an already reviewed tenant response or an explicitly labeled Fixture. Never call a fixture a live run.

**0:00–0:25 — Five reports, one outage.** Open HELP-1041–1043 and point to their source excerpts and matching AIDA query symptoms. Link them. Keep HELP-1044 (account login) and HELP-1045 (LMS) separate. “The original tickets stay intact. The app owns accepted links.”

**0:25–1:00 — Evidence-led analysis.** Export the versioned bundle. In the Enterprise tenant, invoke the configured workflow with the bundle, show triage then investigation, review the JSON, and import it with its supplied run reference. If tenant access is unavailable, use the Fixture button and say so. Open Analysis and expand E-1 and a ticket citation. “Gemini proposes; the app validates cited IDs and keeps write authority.”

**1:00–1:30 — False all-clear.** Open Demo lab. Select False all-clear and run a check. Point to health 200 versus query 503, then the blocked approval. “A green health endpoint does not establish the student's recovery.”

**1:30–2:05 — Real recovery.** Select Recovered. Run the first synthetic query. Explain the five-second minimum separation while showing timestamps. Run the second. Show 2 of 2 fresh passing checks and the expected reply. “Both checks must be after the latest failure and expire in two minutes.”

**2:05–2:30 — Independent decision.** Switch to the reviewer profile, refresh and approve the current revision and probe IDs. Explain that a changed revision, a failed query or stale evidence invalidates the decision. The operator cannot approve.

**2:30–3:00 — Verified outcome.** Switch to operator, refresh, apply approved update. In local mode, explicitly show Local demo update. With a configured sandbox, show Jira update verified only after read-back. Open the audit receipt. Replay the same action key to demonstrate no second transition. Close: “One correlated case, actual student-path evidence, independent approval and a verified receipt.”

## Pitch measurements

Measure hands-on operator time with a stopwatch, pausing while waiting for Enterprise execution or reviewer action. Separately record wall-clock time, reviewer wait, workflow latency, HTTP probe latency, and the required recovery separation. Do not count automated smoke-test execution as hands-on operator time. No human baseline or savings percentage was measured in this build. Use the observed pass/fail case counts from `validation.md`; collect human timings in the organizer rehearsal before making time-saving claims.

| Rehearsal     | Hands-on operator | Enterprise wait  | Reviewer wait    | Wall clock       |
| ------------- | ----------------- | ---------------- | ---------------- | ---------------- |
| Organizer run | Not yet measured  | Not yet measured | Not yet measured | Not yet measured |
