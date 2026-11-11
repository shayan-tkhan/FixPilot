import { after } from "next/server";
import { readHub, mutateHub } from "@/lib/incidents/coordination";
import { NextResponse } from "next/server";
import { z } from "zod";
import { user, login, token, sameOrigin } from "@/lib/auth";
import {
  getState,
  save,
  audit,
  events,
  action,
  reserve,
  putAction,
  withMutation,
} from "@/lib/db";
import {
  bundle,
  validateAnalysis,
  canLink,
  recovery,
  blockers,
  invalidate,
  evidence,
  runbook,
} from "@/lib/incidents/policy";
import {
  execute,
  target,
  transition,
  destination,
  syncTickets,
} from "@/lib/jira";
import { previewData } from "@/lib/incidents/preview";
import { prepareAutomaticIntake } from "@/lib/ai/auto-intake";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const path = (await params).path.join("/");
    if (process.env.FIXPILOT_PREVIEW === "1") {
      if (path === "state") return NextResponse.json(previewData());
      if (path === "bundle")
        return NextResponse.json(bundle(previewData().state));
    }
    const u = await user();
    if (path === "session") return NextResponse.json({ user: u });
    if (!u)
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    if (path === "coordination") {
      const data = await readHub(u);
      if (process.env.VERCEL)
        after(async () => {
          const { runBackground } = await import("@/lib/background");
          await runBackground();
        });
      return NextResponse.json(data);
    }
    if (u.role === "reporter")
      return NextResponse.json(
        { error: "Staff permission required" },
        { status: 403 },
      );
    const s = await getState();
    if (path === "state") {
      const { hub, ...legacyState } = s;
      const history = await events();
      return NextResponse.json({
        state: u.role === "operator" ? legacyState : s,
        user: u,
        events: u.role === "operator" ? history.filter((event) => event.actor === u.id) : history,
        evidence: evidence(s),
        runbook,
        blockers: blockers(s),
        readyProbeIds: recovery(s.probes, s.started).map((p) => p.id),
        mode:
          process.env.JIRA_MODE === "sandbox" ? "Jira sandbox" : "Local demo",
        target: target(),
        transition: transition(),
        targetStatus: destination(),
      });
    }
    if (path === "bundle")
      return await withMutation(async () => {
        const s = await getState();
        s.exportedBundle = `FP-001-r${s.revision}`;
        await save(s);
        await audit(u.id, "bundle.export", { bundleId: s.exportedBundle });
        return NextResponse.json(bundle(s), {
          headers: {
            "Content-Disposition": `attachment; filename="${s.exportedBundle}.json"`,
          },
        });
      });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch {
    return NextResponse.json(
      { error: "Shared database is not configured or unavailable." },
      { status: 503 },
    );
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    sameOrigin(req);
    const path = (await params).path.join("/");
    const body = await req.json();
    if (process.env.FIXPILOT_PREVIEW === "1")
      return NextResponse.json(
        {
          error:
            "Read-only design preview. Configure the shared database to enable workflows.",
        },
        { status: 503 },
      );
    if (path === "login") {
      const b = z
        .object({ email: z.string().email(), password: z.string().max(200) })
        .parse(body);
      const u = login(b.email, b.password);
      const r = NextResponse.json({ user: u });
      r.cookies.set("fp_session", token(u), {
        httpOnly: true,
        sameSite: "strict",
        secure: new URL(req.url).protocol === "https:",
        maxAge: 28800,
        path: "/",
      });
      return r;
    }
    if (path === "logout") {
      const r = NextResponse.json({ ok: true });
      r.cookies.delete("fp_session");
      return r;
    }
    const u = await user();
    if (!u)
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    if (path === "coordination") {
      if (
        u.role === "reporter" &&
        !["report", "suggest", "confirm", "reopen"].includes(body.action)
      )
        return NextResponse.json(
          { error: "Staff permission required" },
          { status: 403 },
        );
      const prepared = body.action === "report"
        ? await prepareAutomaticIntake(u, body)
        : body;
      const result = await mutateHub(u, prepared);
      if (process.env.VERCEL && body.action !== "suggest")
        after(async () => {
          const { runBackground } = await import("@/lib/background");
          await runBackground();
        });
      if (u.role === "reporter")
        return NextResponse.json(
          body.action === "report"
            ? { report: { id: "report" in result ? result.report.id : "" } }
            : body.action === "suggest"
              ? result
              : { ok: true },
        );
      return NextResponse.json(result);
    }
    const reviewer = path === "approve";
    if (
      (reviewer && u.role !== "reviewer") ||
      (!reviewer && u.role !== "operator")
    )
      return NextResponse.json(
        {
          error:
            "This action requires the " +
            (reviewer ? "reviewer" : "operator") +
            " account",
        },
        { status: 403 },
      );
    return await withMutation(async () => {
      const s = await getState();
      if (s.action?.state === "Pending" && path !== "execute")
        throw Error(
          "An approved action is in progress. Wait for verification.",
        );
      if (path === "lab") {
        const b = z
          .object({ scenario: z.enum(["outage", "false-clear", "recovered"]) })
          .parse(body);
        if (s.status === "Resolved") throw Error("Incident is resolved");
        s.scenario = b.scenario;
        invalidate(s);
        await save(s);
        await audit(u.id, "lab.scenario", { scenario: s.scenario });
      } else if (path === "links") {
        const b = z
          .object({ ticketId: z.string(), accepted: z.boolean() })
          .parse(body);
        if (s.status === "Resolved") throw Error("Incident is resolved");
        if (!s.tickets.some((t) => t.id === b.ticketId))
          throw Error("Unknown ticket");
        if (b.accepted && !canLink(s, b.ticketId))
          throw Error(
            "Service, failure signature, or incident window does not match; keep this report separate.",
          );
        s.linked = s.linked.filter((id) => id !== b.ticketId);
        s.excluded = s.excluded.filter((id) => id !== b.ticketId);
        (b.accepted ? s.linked : s.excluded).push(b.ticketId);
        invalidate(s);
        await save(s);
        await audit(u.id, "ticket.review", b);
      } else if (path === "analysis") {
        const b = z
          .object({
            analysis: z.unknown(),
            source: z.enum(["Fixture", "Enterprise manual import"]),
            runReference: z.string().max(300).default(""),
          })
          .parse(body);
        s.analysis = validateAnalysis(b.analysis, s);
        s.analysisSource = b.source;
        s.runReference = b.runReference;
        invalidate(s);
        await save(s);
        await audit(u.id, "analysis.import", {
          source: b.source,
          runReference: b.runReference,
        });
      } else if (path === "sync") {
        const tickets = await syncTickets();
        const current = await getState();
        for (const t of tickets)
          if (!current.tickets.some((x) => x.sourceId === t.sourceId))
            current.tickets.push(t);
        if (tickets.length) invalidate(current);
        await save(current);
        await audit(u.id, "ticket.sync", {
          count: tickets.length,
          mode: process.env.JIRA_MODE || "local",
        });
      } else if (path === "probe") {
        if (s.status === "Resolved") throw Error("Incident is resolved");
        const revision = s.revision;
        const host =
          process.env.LAB_BASE_URL ||
          process.env.APP_ORIGIN ||
          "http://localhost:3000";
        async function check(endpoint: string, method: string) {
          try {
            const r = await fetch(host + "/api/lab/aida/" + endpoint, {
              method,
              headers: {
                "Content-Type": "application/json",
                // Authenticate server-to-server lab calls only to the configured app origin.
                ...(process.env.VERCEL &&
                host === process.env.APP_ORIGIN &&
                process.env.VERCEL_AUTOMATION_BYPASS_SECRET
                  ? {
                      "x-vercel-protection-bypass":
                        process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
                    }
                  : {}),
              },
              redirect: "error",
              ...(method === "POST"
                ? {
                    body: JSON.stringify({
                      credential: "synthetic-student-lab",
                      question: "Reply with the AIDA diagnostic marker.",
                    }),
                  }
                : {}),
              signal: AbortSignal.timeout(3000),
              cache: "no-store",
            });
            const data = await r.json();
            return {
              status: r.status,
              expected: data.reply === "FIXPILOT_AIDA_OK",
            };
          } catch {
            return { status: 0, expected: false };
          }
        }
        const [h, q] = await Promise.all([
          check("health", "GET"),
          check("query", "POST"),
        ]);
        const current = await getState();
        if (current.revision !== revision)
          throw Error("Incident changed during probe. Run again.");
        const p = {
          id: "P-" + crypto.randomUUID().slice(0, 8),
          at: Date.now(),
          health: h.status,
          query: q.status,
          expected: q.expected,
          service: "AIDA",
        };
        current.probes.push(p);
        invalidate(current);
        current.status = blockers(current).length
          ? "Verifying"
          : "Awaiting approval";
        await save(current);
        await audit(u.id, "probe.completed", p);
      } else if (path === "approve") {
        const b = z
          .object({
            revision: z.number().int(),
            probeIds: z.array(z.string()).length(2),
            target: z.string(),
            transition: z.string(),
            targetStatus: z.string(),
          })
          .parse(body);
        if (
          b.target !== target() ||
          b.transition !== transition() ||
          b.targetStatus !== destination()
        )
          throw Error("Target action changed. Review it again.");
        if (blockers(s).length) throw Error(blockers(s).join(" "));
        if (b.revision !== s.revision) throw Error("Case revision changed");
        const ids = recovery(s.probes, s.started).map((p) => p.id);
        if (JSON.stringify(b.probeIds) !== JSON.stringify(ids))
          throw Error("Probe selection changed");
        s.approval = {
          reviewer: u.id,
          revision: s.revision,
          probeIds: ids,
          target: target(),
          transition: transition(),
          targetStatus: destination(),
          expires: Date.now() + 120_000,
          key: crypto.randomUUID(),
        };
        s.status = "Awaiting approval";
        await save(s);
        await audit(u.id, "closure.approved", s.approval);
      } else if (path === "execute") {
        const b = z.object({ approvalKey: z.string() }).parse(body);
        const existing = await action(b.approvalKey);
        if (existing?.state === "Confirmed")
          return NextResponse.json({ ok: true, action: existing });
        const a = s.approval;
        if (
          !a ||
          a.key !== b.approvalKey ||
          a.reviewer === u.id ||
          a.revision !== s.revision ||
          a.expires <= Date.now() ||
          a.target !== target() ||
          a.transition !== transition() ||
          a.targetStatus !== destination() ||
          blockers(s).length ||
          JSON.stringify(a.probeIds) !==
            JSON.stringify(recovery(s.probes, s.started).map((p) => p.id))
        )
          throw Error(
            "Approval is missing, expired, or superseded. Fresh evidence and reviewer approval are required.",
          );
        if (existing?.state === "Pending" && Date.now() - existing.at < 10000)
          throw Error("Action in progress; wait for its recorded outcome");
        const pending = {
          key: a.key,
          state: "Pending",
          label: "Pending verification",
          issue: a.target,
          status: "Unknown",
          at: Date.now(),
          detail: "Action reserved",
        };
        if (!existing && !(await reserve(a.key, pending)))
          throw Error("Action already reserved");
        s.action = pending;
        await save(s);
        let outcome;
        try {
          const result = await execute(!!existing, async () => {
            const latest = await getState();
            if (
              latest.revision !== a.revision ||
              a.expires <= Date.now() ||
              blockers(latest).length
            )
              throw Error(
                "Approval or recovery evidence expired before the write",
              );
          });
          outcome = {
            ...pending,
            state: result.confirmed ? "Confirmed" : "Unconfirmed",
            label: result.label,
            status: result.status,
            detail: result.detail,
            at: Date.now(),
          };
        } catch (e) {
          outcome = {
            ...pending,
            state: "Unconfirmed",
            label: "Update unconfirmed",
            detail: `${e instanceof Error ? e.message : "Jira request failed"}. Reconcile external status before another write.`,
            at: Date.now(),
          };
        }
        await putAction(outcome);
        const current = await getState();
        current.action = outcome;
        if (outcome.state === "Confirmed" && current.revision === a.revision) {
          current.status = "Resolved";
        }
        await save(current);
        await audit(u.id, "action.result", {
          ...outcome,
          reviewer: a.reviewer,
          probeIds: a.probeIds,
          transition: a.transition,
          targetStatus: a.targetStatus,
        });
      } else return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Invalid request structure"
            : e instanceof Error
              ? e.message
              : "Request failed",
      },
      { status: 400 },
    );
  }
}
