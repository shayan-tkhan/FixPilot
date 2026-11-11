# FixPilot update — 11 November 2026

Preview validation: dpl_HuUoYJA1YSQ74ffv5RuCdPA23ZsE
Production build: dpl_JDKAYvMsotAaw2keDynfm2hrwA2J

- Added a six-step guided walkthrough on each role dashboard: student report, sample triage/assignment, technician acknowledgement, illustrative before/after evidence, staff approval, and student confirmation. It uses browser state only and is explicitly scripted. Completing the walkthrough left the saved issue snapshot unchanged.
- Added live response countdowns to issue cards and task details, using the existing durable rules: reminder at 24 hours and reassignment check at 48 hours without acknowledgement. Starting work acknowledges the assignment. Three boundary/lifecycle tests added.
- Unified chronological timeline combines reporting, actual updates and evidence timestamps. No approval or resolution event is invented from a current status.
- Added real upload progress, including the distinction between bytes sent and evidence saved. Students can add evidence to an existing report and retry an attachment without creating another report.
- Added a fixed mobile report button, larger touch targets, 16px form inputs and a scrollable mobile report dialog.

Validation: 83 tests in 16 files passed, with TypeScript and production build passing on preview. Browser checks exercised all six walkthrough steps, reporter photo upload with a real sample PNG, its evidence timeline entry, staff assignment and response deadline, and technician acknowledgement. A 390px viewport had no horizontal overflow; mobile report button and submit controls met 44px/48px sizes. Temporary QA issue was deleted after testing. No full accessibility or performance audit was performed.

Live AI provider access is still blocked by Vercel verification. The walkthrough needs no AI credits and labels its scripted triage and illustrations explicitly.
