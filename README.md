# FixPilot AI

Campus issue reporting for students, department staff, technicians, and administrators.

[Open the live demo](https://fixpilot-public-demo.vercel.app/operations)

## Watch the workflow

[Watch the 74-second narrated workflow](https://github.com/shayan-tkhan/FixPilot/blob/main/docs/media/fixpilot-demo.mp4) · [Download the MP4](https://raw.githubusercontent.com/shayan-tkhan/FixPilot/main/docs/media/fixpilot-demo.mp4) · [Download captions](docs/media/fixpilot-demo.srt)

The explainer covers lost reports, unclear ownership, missing updates, and repairs closed too early. It follows a fictional leaking-tap report through student intake, staff routing, technician work, independent staff approval, and student confirmation or reopening.

Filmed in an isolated local demo using a completion note; no physical repair or live AI verification is claimed. Includes AI-generated local Kokoro narration, matching on-screen captions, and music by [Sascha Ende, ende.app](https://ende.app/en), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Features

- Role-specific dashboards, monthly statistics, and issue timelines.
- Student reports with photo/video attachments and upload progress.
- Department assignment, twelve technician profiles, and response countdowns.
- APU campus and residence maps with active issue indicators.
- Before/after evidence, staff approval, and student confirmation or reopening.
- A free six-step guided walkthrough and separate read-only presentation mode.
- Advisory AI intake and media comparison when provider access is available. Manual reporting remains available; scripted examples are labeled.

## Try every role

Select a role on the sign-in page, or open **More demo accounts**. Email and the disposable password `demo123` fill automatically for all 17 accounts.

| Role | Demo account |
| --- | --- |
| Student | reporter@fixpilot.demo |
| Department staff | reviewer@fixpilot.demo |
| Technician | operator@fixpilot.demo |
| Administrator | admin@fixpilot.demo |

These accounts and identities are fictional demo profiles.

## Run locally

Requires Node.js 24. From the project folder in PowerShell:

```powershell
npm ci
Copy-Item .env.example .env.local
# Set SESSION_SECRET to a random value of at least 32 characters.
npm run seed
npm run dev
```

Open `http://localhost:3000`. Run checks with `npm test` and `npm run build`.

Built with Next.js, React, and TypeScript. See [release checks](docs/release-checks.md), [validation notes](docs/validation.md), and the [demo script](docs/demo-script.md).

Live AI access still depends on Vercel account verification. The guided walkthrough requires no AI credits and does not change saved reports.
