"use client";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  ArrowRight,
  Check,
  ChevronRight,
  Command,
  Download,
  Eye,
  EyeOff,
  FileText,
  FlaskConical,
  GitMerge,
  LayoutDashboard,
  Link2,
  Loader2,
  LogOut,
  MoreHorizontal,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Ticket,
  Upload,
  X,
  Clock,
  CheckCircle2,
  AlertTriangle,
  PanelLeftClose,
} from "lucide-react";
import type { State } from "@/lib/db";
import type { User } from "@/lib/auth";
type Data = {
  preview?: boolean;
  state: State;
  user: User;
  events: {
    id: number;
    actor: string;
    at: number;
    event: string;
    detail: string;
  }[];
  evidence: { id: string; source: string; at: number; text: string }[];
  runbook: { id: string; text: string }[];
  blockers: string[];
  readyProbeIds: string[];
  mode: string;
  target: string;
  transition: string;
  targetStatus: string;
};
const time = (t: number) =>
  new Date(t).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
const stamp = (t: number) =>
  new Date(t).toLocaleString("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export default function Home() {
  const [data, setData] = useState<Data | null>(null);
  const [session, setSession] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("Incidents");
  const [tab, setTab] = useState("Overview");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [source, setSource] = useState("Enterprise manual import");
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("operator@fixpilot.demo");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  async function refresh() {
    try {
      const r = await fetch("/api/state");
      if (r.ok) {
        const d = await r.json();
        setData(d);
        setSession(d.user);
      } else {
        const d = await r.json();
        if (r.status !== 401) setError(d.error || "Workspace unavailable");
        setSession(null);
        setData(null);
      }
      setLoaded(true);
    } catch {
      setError("Connection lost. Check the server and reload.");
      setLoaded(true);
    }
  }
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("evidence")) {
      refresh();
      return;
    }
    fetch("/api/session")
      .then((r) => {
        if (!r.ok) throw Error("Session check failed");
        return r.json();
      })
      .then((d) => {
        if (d.user) window.location.replace("/operations");
        else setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
        setError("Could not check your session. You can still sign in below.");
      });
  }, []);
  useEffect(() => {
    if (!session) return;
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [session?.id]);
  async function act(path: string, body: unknown = {}) {
    setBusy(path);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (path === "logout" || path === "login") {
        setPassword("");
        setShowPassword(false);
      }
      if (path === "login") {
        window.location.replace("/operations");
        return true;
      }
      await refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return false;
    } finally {
      setBusy("");
    }
  }
  async function exportBundle() {
    setBusy("bundle");
    try {
      const r = await fetch("/api/bundle");
      if (!r.ok) throw Error("Export failed");
      const json = await r.json();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = json.bundleId + ".json";
      a.click();
      URL.revokeObjectURL(url);
      await refresh();
      setNotice(
        "Current evidence bundle exported. Run the Enterprise workflow, review its JSON, then import.",
      );
    } catch {
      setError("Could not export bundle");
    }
    setBusy("");
  }
  async function fixture() {
    await exportBundle();
    const r = await fetch("/api/state");
    const d: Data = await r.json();
    const a = {
      bundleId: `FP-001-r${d.state.revision}`,
      proposedTicketIds: ["T-1", "T-2", "T-3"],
      excludedTickets: [
        { ticketId: "T-4", reason: "Account-specific sign-in failure" },
        { ticketId: "T-5", reason: "Different affected service" },
      ],
      observations: [
        {
          text: "Three reports describe unanswered AIDA queries in the same window, corroborated by the query-error alert.",
          evidenceIds: ["E-1", "E-T-1", "E-T-2", "E-T-3"],
        },
      ],
      hypotheses: [
        {
          text: "The AIDA query path may be failing. The underlying cause is not confirmed.",
          evidenceIds: ["E-1"],
        },
      ],
      conflicts: [],
      nextCheck: "RUN_AIDA_USER_PROBE",
      runbookSectionIds: ["RB-AIDA-01#query-check"],
      unknowns: ["Underlying cause remains unconfirmed."],
    };
    setRaw(JSON.stringify(a, null, 2));
    setSource("Fixture");
    setImportOpen(true);
  }
  const s = data?.state;
  const isOperator = session?.role === "operator";
  const last = s?.probes.at(-1);
  const nav = [
    { name: "Overview", icon: LayoutDashboard },
    { name: "Incidents", icon: Activity },
    { name: "Reports", icon: Ticket },
    { name: "Demo lab", icon: FlaskConical },
    { name: "Audit log", icon: ShieldCheck },
  ];
  if (!loaded)
    return (
      <div className="loading">
        <div className="logo-mark">
          <Command size={23} />
        </div>
        <span>Opening workspace</span>
        <Loader2 className="spin" size={18} />
      </div>
    );
  if (!session)
    return (
      <main className="login-page">
        <div className="login-art">
          <div className="brand">
            <div className="logo-mark">
              <Command />
            </div>
            fixpilot<span>AI</span>
          </div>
          <div className="login-copy">
            <span className="eyebrow">LESS NOISE. MORE CERTAINTY.</span>
            <h1>
              From first signal.
              <br />
              To verified recovery.
            </h1>
            <p>
              A focused workspace for the moments
              <br />
              when every report matters.
            </p>
            <div className="signal-lines">
              {Array.from({ length: 35 }, (_, i) => (
                <i
                  key={i}
                  style={{ height: 30 + Math.sin(i * 0.5) * 25 + i * 3 }}
                />
              ))}
            </div>
            <span className="mono muted">
              APU CLOUD INNOVATION HACKATHON · FIXPILOT AI
            </span>
          </div>
        </div>
        <div className="login-form">
          <span className="badge">
            <i /> CONTROLLED LAB
          </span>
          <img src="/icon.svg" alt="FixPilot" width="42" height="42" />
          <h2>Sign in</h2>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await act("login", { email, password });
            }}
          >
            <label>
              Email address
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <div className="password-control">
              <label htmlFor="demo-password">Password</label>
              <div className="password-input">
                <input
                  id="demo-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  className="password-toggle"
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  aria-controls="demo-password"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <button className="primary full" disabled={!!busy}>
              {busy ? <Loader2 size={16} className="spin" /> : "Open workspace"}
              <ArrowRight size={16} />
            </button>
          </form>
          <div className="account-options">
            <button onClick={() => setEmail("reporter@fixpilot.demo")}>
              Student / User <ArrowUpRight size={13} />
            </button>
            <button onClick={() => setEmail("operator@fixpilot.demo")}>
              Technician <ArrowUpRight size={13} />
            </button>
            <button onClick={() => setEmail("reviewer@fixpilot.demo")}>
              Department Staff <ArrowUpRight size={13} />
            </button>
          </div>
          <details className="demo-accounts">
            <summary>More demo accounts</summary>
            <button onClick={() => setEmail("reporter2@fixpilot.demo")}>
              Noor · Second student
            </button>
            <button onClick={() => setEmail("reviewer2@fixpilot.demo")}>
              Priya · Backup reviewer
            </button>
            <button onClick={() => setEmail("technician2@fixpilot.demo")}>
              Riley · Backup technician
            </button>
          </details>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <small className="muted">
            Demo workspace
            <br />
          </small>
        </div>
      </main>
    );
  if (!s || !data) return null;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <div className="logo-mark">
            <Command size={21} />
          </div>
          fixpilot<span>AI</span>
        </a>
        <button className="workspace-switch">
          <div className="workspace-avatar">F</div>
          <span>
            APU Cloud Lab<small>Demo workspace</small>
          </span>
          <MoreHorizontal size={17} />
        </button>
        <div className="nav-label">WORKSPACE</div>
        <a className="nav-item" href="/operations">
          <LayoutDashboard size={17} />
          Command center
        </a>
        <nav>
          {nav.map((n) => (
            <button
              key={n.name}
              className={view === n.name ? "nav-item active" : "nav-item"}
              onClick={() => {
                setView(n.name);
                if (n.name === "Reports") setTab("Reports");
              }}
            >
              <n.icon size={17} />
              {n.name}
              {n.name === "Incidents" && <span className="nav-count">1</span>}
              {n.name === "Demo lab" && <span className="tiny-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="integration-card">
            <div>
              <Radio size={15} />
              <span>Environment</span>
              <i className="green-dot" />
            </div>
            <strong>{data.mode}</strong>
            <small>AIDA controlled lab</small>
            <div className="integration-note">
              Enterprise: manual handoff
              <br />
              Telemetry: sandbox probes
            </div>
          </div>
          <button
            className="profile"
            aria-label={data.preview ? "Read-only preview account" : "Sign out"}
            disabled={data.preview}
            onClick={() => act("logout")}
            title="Sign out"
          >
            <span className="avatar">
              {session.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </span>
            <span>
              {session.name}
              <small>{session.role}</small>
            </span>
            <LogOut size={15} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <PanelLeftClose size={17} />
            <span className="divider" />
            <span>Workspace</span>
            <ChevronRight size={13} />
            <span>{view}</span>
          </div>
          <div>
            <span className="top-lab">
              <i /> Lab environment
            </span>
            <span className="divider" />
            <span className="mono">FP / 001</span>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                OPERATIONS /{" "}
                {view === "Demo lab"
                  ? "CONTROLLED ENVIRONMENT"
                  : "INCIDENT WORKSPACE"}
              </div>
              <h1>
                {view === "Demo lab"
                  ? "AIDA demo lab"
                  : view === "Audit log"
                    ? "Activity & audit"
                    : view === "Reports"
                      ? "Incoming reports"
                      : view === "Overview"
                        ? "Operations overview"
                        : "Incident workspace"}
                <span className="title-dot" />
              </h1>
              <p>
                Connect the signals. Investigate with evidence. Close with
                confidence.
              </p>
            </div>
            <button
              className="secondary"
              disabled={!!busy || !isOperator}
              onClick={() => act("sync")}
            >
              <RefreshCw size={14} className={busy === "sync" ? "spin" : ""} />{" "}
              Sync reports
            </button>
          </div>
          {error && (
            <div className="error" role="alert">
              <AlertTriangle size={16} />
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={14} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
                <X size={14} />
              </button>
            </div>
          )}
          {data.preview && (
            <div className="preview-banner">
              <FlaskConical size={14} />
              <span>
                <strong>Read-only design preview</strong> · Fictional fixture
                data. Persistent workflows will be enabled after the shared
                database is connected.
              </span>
            </div>
          )}
          <div className="metrics">
            <div
              className={
                s.status === "Resolved"
                  ? "metric-alert metric-clear"
                  : "metric-alert"
              }
            >
              <span>
                Active incidents <Activity size={14} />
              </span>
              <strong>
                {s.status === "Resolved" ? "0" : "01"}
                <small className="amber">
                  {s.status === "Resolved"
                    ? "Recovery confirmed"
                    : "Needs investigation"}
                </small>
              </strong>
              <div className="metric-line amber-line" />
            </div>
            <div className="metric-incoming">
              <span>
                Incoming reports <Ticket size={14} />
              </span>
              <strong>
                {String(s.tickets.length).padStart(2, "0")}
                <small>Across 2 services</small>
              </strong>
              <div className="metric-bars">
                {[20, 35, 25, 50, 35, 65, 48, 80, 52, 90, 65, 85].map(
                  (x, i) => (
                    <i key={i} style={{ height: x + "%" }} />
                  ),
                )}
              </div>
            </div>
            <div className="metric-linked">
              <span>
                Linked to incident <GitMerge size={14} />
              </span>
              <strong>
                {String(s.linked.length).padStart(2, "0")}
                <small className="cyan">
                  {s.linked.length
                    ? "Corroborated reports"
                    : "Awaiting operator review"}
                </small>
              </strong>
              <div className="metric-line cyan-line" />
            </div>
            <div
              className={
                data.readyProbeIds.length === 2
                  ? "metric-recovery verified"
                  : "metric-recovery"
              }
            >
              <span>
                Recovery checks <ShieldCheck size={14} />
              </span>
              <strong>
                {data.readyProbeIds.length}
                <span className="fraction"> / 2</span>
                <small
                  className={data.readyProbeIds.length === 2 ? "green" : ""}
                >
                  {data.readyProbeIds.length === 2
                    ? "Ready for approval"
                    : "Fresh passing queries"}
                </small>
              </strong>
              <div className="check-progress">
                <i className={data.readyProbeIds.length > 0 ? "passed" : ""} />
                <i className={data.readyProbeIds.length > 1 ? "passed" : ""} />
              </div>
            </div>
          </div>
          {view === "Demo lab" ? (
            <section className="panel lab-large">
              <div className="panel-heading">
                <div>
                  <FlaskConical size={17} />
                  <h2>Controlled lab</h2>
                </div>
                <span className="badge">SANDBOX TELEMETRY</span>
              </div>
              <div className="lab-body">
                <h2>Test what the student experiences.</h2>
                <p className="muted">
                  Switch the AIDA lab scenario, then run both HTTP checks. A
                  healthy endpoint alone cannot establish recovery.
                </p>
                <div className="scenario-grid">
                  {[
                    ["outage", "01", "Outage", "Health and queries fail."],
                    [
                      "false-clear",
                      "02",
                      "False all-clear",
                      "Health passes. Student queries fail.",
                    ],
                    [
                      "recovered",
                      "03",
                      "Recovered",
                      "Both endpoints return expected results.",
                    ],
                  ].map(([id, n, title, desc]) => (
                    <button
                      key={id}
                      className={
                        "scenario " + (s.scenario === id ? "selected" : "")
                      }
                      disabled={!isOperator || !!busy}
                      onClick={() => act("lab", { scenario: id })}
                    >
                      <span className="mono">{n}</span>
                      <strong>{title}</strong>
                      <p>{desc}</p>
                      <span>
                        {s.scenario === id ? (
                          <CheckCircle2 size={18} />
                        ) : (
                          <ArrowUpRight size={18} />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
                <ProbeView last={last} />
                <button
                  className="primary"
                  disabled={!isOperator || !!busy}
                  onClick={() => act("probe")}
                >
                  <Play size={14} />{" "}
                  {busy === "probe" ? "Checking…" : "Run recovery check"}
                </button>
              </div>
            </section>
          ) : view === "Audit log" ? (
            <section className="panel">
              <div className="panel-heading">
                <h2>Immutable activity trail</h2>
                <span className="muted">Latest 50 events</span>
              </div>
              <div className="audit-list">
                {data.events.length ? (
                  data.events.map((e) => (
                    <div key={e.id}>
                      <span className="timeline-dot" />
                      <span className="mono muted">{stamp(e.at)}</span>
                      <strong>{e.event}</strong>
                      <small>{e.actor}</small>
                      <details>
                        <summary>Receipt</summary>
                        <pre>
                          {JSON.stringify(JSON.parse(e.detail), null, 2)}
                        </pre>
                      </details>
                    </div>
                  ))
                ) : (
                  <div className="empty">
                    Actions will appear here as you investigate.
                  </div>
                )}
              </div>
            </section>
          ) : (
            <div className="incident-layout">
              <div className="incident-main">
                <section className="panel incident-panel">
                  <div className="incident-top">
                    <span className="incident-id">
                      <Activity size={14} /> FP-001
                    </span>
                    <span
                      className={
                        "status " + (s.status === "Resolved" ? "resolved" : "")
                      }
                    >
                      <i />
                      {s.status}
                    </span>
                    <span className="priority">P2 · High</span>
                    <button
                      className="icon-button"
                      title="View audit trail"
                      onClick={() => setView("Audit log")}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  </div>
                  <h2>AIDA queries are not responding</h2>
                  <p className="incident-description">
                    Multiple student reports point to an interruption in the
                    AIDA query service.
                  </p>
                  <div className="incident-meta">
                    <span>
                      <span className="service-icon">A</span>AIDA assistant
                    </span>
                    <span>
                      <span className="mini-avatar">AM</span>
                      {s.owner}
                    </span>
                    <span>
                      <Clock size={13} />
                      {stamp(s.started)}
                    </span>
                    <span className="mono">rev {s.revision}</span>
                  </div>
                  <div className="lifecycle">
                    {[
                      "Investigating",
                      "Verifying",
                      "Awaiting approval",
                      "Resolved",
                    ].map((v, i) => (
                      <div
                        key={v}
                        className={
                          [
                            "Investigating",
                            "Verifying",
                            "Awaiting approval",
                            "Resolved",
                          ].indexOf(s.status) >= i
                            ? "current"
                            : ""
                        }
                      >
                        <span>
                          {[
                            "Investigating",
                            "Verifying",
                            "Awaiting approval",
                            "Resolved",
                          ].indexOf(s.status) > i ? (
                            <Check size={11} />
                          ) : (
                            i + 1
                          )}
                        </span>
                        {v}
                        {i < 3 && <i />}
                      </div>
                    ))}
                  </div>
                  <div className="tabs">
                    {["Overview", "Reports", "Evidence", "Analysis"].map(
                      (t) => (
                        <button
                          key={t}
                          onClick={() => setTab(t)}
                          className={tab === t ? "selected" : ""}
                        >
                          {t}
                          {t === "Reports" && <span>{s.tickets.length}</span>}
                        </button>
                      ),
                    )}
                  </div>
                  {(tab === "Overview" || tab === "Reports") && (
                    <div className="report-section">
                      <div className="section-heading">
                        <h3>
                          Correlated reports{" "}
                          <span>{s.linked.length} linked</span>
                        </h3>
                        <div className="search">
                          <Search size={13} />
                          <input
                            aria-label="Search reports"
                            placeholder="Find a report…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                          />
                          <span>⌕</span>
                        </div>
                      </div>
                      <div className="table-header">
                        <span>REPORT</span>
                        <span>SERVICE</span>
                        <span>LINK REVIEW</span>
                      </div>
                      {s.tickets
                        .filter((t) =>
                          (t.summary + t.sourceId)
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                        )
                        .map((t) => (
                          <div className="ticket-row" key={t.id}>
                            <div className="ticket-text">
                              <span className="ticket-icon">
                                <Ticket size={15} />
                              </span>
                              <div>
                                <span className="ticket-id">
                                  {t.sourceId} <span>· {time(t.at)}</span>
                                </span>
                                <details>
                                  <summary>{t.summary}</summary>
                                  <p>{t.description}</p>
                                  <small>
                                    {t.source} · {t.id}
                                  </small>
                                  {t.jiraUrl && (
                                    <a
                                      href={t.jiraUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Open Jira issue ↗
                                    </a>
                                  )}
                                </details>
                              </div>
                            </div>
                            <span
                              className={
                                "service-tag " +
                                (t.service === "LMS" ? "purple" : "")
                              }
                            >
                              {t.service}
                            </span>
                            <div className="link-actions">
                              {s.linked.includes(t.id) ? (
                                <button
                                  className="linked"
                                  disabled={!isOperator || !!busy}
                                  onClick={() =>
                                    act("links", {
                                      ticketId: t.id,
                                      accepted: false,
                                    })
                                  }
                                >
                                  <Link2 size={12} />
                                  Linked
                                  <X size={11} />
                                </button>
                              ) : s.excluded.includes(t.id) ? (
                                <button
                                  className="separate"
                                  disabled={!isOperator || !!busy}
                                  onClick={() =>
                                    act("links", {
                                      ticketId: t.id,
                                      accepted: true,
                                    })
                                  }
                                >
                                  Separate <Plus size={11} />
                                </button>
                              ) : (
                                <>
                                  <button
                                    className="accept"
                                    title="Accept incident link"
                                    disabled={!isOperator || !!busy}
                                    onClick={() =>
                                      act("links", {
                                        ticketId: t.id,
                                        accepted: true,
                                      })
                                    }
                                  >
                                    <Plus size={12} />
                                    Link
                                  </button>
                                  <button
                                    className="icon-button"
                                    title="Keep separate"
                                    disabled={!isOperator || !!busy}
                                    onClick={() =>
                                      act("links", {
                                        ticketId: t.id,
                                        accepted: false,
                                      })
                                    }
                                  >
                                    <X size={12} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      <div className="table-footer">
                        <span>
                          <ShieldCheck size={12} /> Original reports preserved
                        </span>
                        <span>5 fictional reports · 2 services</span>
                      </div>
                    </div>
                  )}
                  {tab === "Evidence" && (
                    <div className="evidence-list">
                      {data.evidence.map((e) => (
                        <article key={e.id}>
                          <span className="timeline-dot" />
                          <div>
                            <div>
                              <span className="mono cyan">{e.id}</span>
                              <time>{stamp(e.at)}</time>
                            </div>
                            <h3>{e.source}</h3>
                            <p>{e.text}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                  {tab === "Analysis" && (
                    <div className="analysis-body">
                      <div className="section-heading">
                        <h3>Investigation findings</h3>
                        <span className="badge">
                          {s.analysisSource || "NOT IMPORTED"}
                        </span>
                      </div>
                      {s.analysis ? (
                        <>
                          <p className="muted mono">
                            {s.analysis.bundleId}
                            {s.runReference && " · " + s.runReference}
                          </p>
                          {(
                            ["observations", "hypotheses", "conflicts"] as const
                          ).map((k) => (
                            <div key={k}>
                              <h4>{k}</h4>
                              {s.analysis![k].length ? (
                                s.analysis![k].map((o, i) => (
                                  <div className="finding" key={i}>
                                    <p>{o.text}</p>
                                    {o.evidenceIds.map((id) => (
                                      <details key={id}>
                                        <summary>
                                          {id} · view source excerpt
                                        </summary>
                                        <blockquote>
                                          {
                                            data.evidence.find(
                                              (e) => e.id === id,
                                            )?.text
                                          }
                                        </blockquote>
                                      </details>
                                    ))}
                                  </div>
                                ))
                              ) : (
                                <p className="muted">None reported.</p>
                              )}
                            </div>
                          ))}
                          <h4>Excluded & uncertain</h4>
                          {s.analysis.excludedTickets.map((t) => (
                            <p key={t.ticketId} className="muted">
                              {t.ticketId} — {t.reason}
                            </p>
                          ))}
                          <h4>Next diagnostic check</h4>
                          <p className="cyan mono">{s.analysis.nextCheck}</p>
                          {s.analysis.runbookSectionIds.map((id) => (
                            <blockquote key={id}>
                              <strong>{id}</strong>
                              <p>
                                {data.runbook.find((r) => r.id === id)?.text}
                              </p>
                            </blockquote>
                          ))}
                          <h4>Unknowns</h4>
                          {s.analysis.unknowns.map((u) => (
                            <p className="muted" key={u}>
                              {u}
                            </p>
                          ))}
                        </>
                      ) : (
                        <div className="empty">
                          <Sparkles size={24} />
                          <h3>Evidence first. Analysis next.</h3>
                          <p>
                            Export this revision to the Enterprise workflow.
                            <br />
                            Review the result and import its cited findings.
                          </p>
                          <button className="secondary" onClick={exportBundle}>
                            <Download size={14} /> Export investigation bundle
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </section>
                {tab === "Overview" && (
                  <section className="panel recovery-panel">
                    <div className="panel-heading">
                      <div>
                        <Radio size={16} />
                        <h2>Recovery verification</h2>
                      </div>
                      <span className="badge">
                        <i /> LIVE LAB PROBES
                      </span>
                    </div>
                    <div className="recovery-content">
                      <ProbeView last={last} />
                      <div className="probe-note">
                        <span>
                          <AlertTriangle size={13} /> Health alone does not
                          prove recovery.
                        </span>
                        <button
                          className="text-button"
                          onClick={() => setView("Demo lab")}
                        >
                          Open demo lab <ArrowUpRight size={13} />
                        </button>
                      </div>
                      <div className="probe-bottom">
                        <div>
                          <strong>
                            {data.readyProbeIds.length} of 2 passing checks
                          </strong>
                          <small>5s separation · valid for 2 minutes</small>
                        </div>
                        <button
                          className="primary"
                          disabled={
                            !isOperator || !!busy || s.status === "Resolved"
                          }
                          onClick={() => act("probe")}
                        >
                          {busy === "probe" ? (
                            <Loader2 size={14} className="spin" />
                          ) : (
                            <Play size={13} />
                          )}
                          Run recovery check
                        </button>
                      </div>
                      {s.probes.length > 0 && (
                        <div className="probe-history">
                          {s.probes
                            .slice(-4)
                            .reverse()
                            .map((p) => (
                              <div key={p.id}>
                                <span
                                  className={p.expected ? "green" : "amber"}
                                >
                                  {p.expected ? (
                                    <CheckCircle2 size={13} />
                                  ) : (
                                    <X size={13} />
                                  )}
                                </span>
                                <span className="mono">{p.id}</span>
                                <span>{time(p.at)}</span>
                                <span>HTTP {p.query || "timeout"}</span>
                                <span
                                  className={
                                    data.readyProbeIds.includes(p.id)
                                      ? "green"
                                      : "muted"
                                  }
                                >
                                  {data.readyProbeIds.includes(p.id)
                                    ? "Fresh"
                                    : p.expected
                                      ? "Not eligible"
                                      : "Failed query"}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </div>
              <aside className="right-column">
                <section className="panel assistant-panel">
                  <div className="panel-heading">
                    <div>
                      <Sparkles size={16} className="cyan" />
                      <h2>Investigation copilot</h2>
                    </div>
                    <span className="small-label">GEMINI</span>
                  </div>
                  <div className="assistant-body">
                    <span className="badge">
                      {s.analysisSource || "ENTERPRISE HANDOFF"}
                    </span>
                    <h3>
                      {s.analysis
                        ? "The evidence is connected."
                        : "Turn reports into a clearer picture."}
                    </h3>
                    <p>
                      {s.analysis
                        ? s.analysis.observations[0]?.text
                        : "Review shared symptoms, source evidence, and the next safe diagnostic check."}
                    </p>
                    <div className="assistant-step">
                      <span>01</span>
                      <div>
                        <strong>Export the evidence</strong>
                        <small>Versioned, original source excerpts</small>
                      </div>
                      <Check
                        size={13}
                        className={s.exportedBundle ? "green" : "muted"}
                      />
                    </div>
                    <div className="assistant-step">
                      <span>02</span>
                      <div>
                        <strong>Investigate in Enterprise</strong>
                        <small>Read-only, reviewed JSON handoff</small>
                      </div>
                    </div>
                    <div className="assistant-step">
                      <span>03</span>
                      <div>
                        <strong>Bring back the findings</strong>
                        <small>Citations validated by FixPilot</small>
                      </div>
                      <Check
                        size={13}
                        className={s.analysis ? "green" : "muted"}
                      />
                    </div>
                    <button
                      className="secondary full"
                      onClick={exportBundle}
                      disabled={!!busy}
                    >
                      <Download size={14} /> Export investigation bundle
                      <ArrowUpRight size={13} />
                    </button>
                    <button
                      className="primary full"
                      onClick={() => {
                        setRaw("");
                        setSource("Enterprise manual import");
                        setImportOpen(true);
                      }}
                      disabled={!isOperator || !!busy}
                    >
                      <Upload size={14} /> Import reviewed analysis
                    </button>
                    <button
                      className="fixture-button"
                      onClick={fixture}
                      disabled={!isOperator || !!busy}
                    >
                      Use a labeled fixture for the demo{" "}
                      <ArrowRight size={12} />
                    </button>
                  </div>
                  <div className="assistant-footer">
                    <ShieldCheck size={12} /> Analysis suggests. Your team
                    decides.
                  </div>
                </section>
                <section className="panel approval-panel">
                  <div className="panel-heading">
                    <div>
                      <ShieldCheck size={16} />
                      <h2>Closure approval</h2>
                    </div>
                    <span className="lock-dot" />
                  </div>
                  <div className="approval-body">
                    <div className="approval-status">
                      {s.status === "Resolved" ? (
                        <CheckCircle2 size={19} className="green" />
                      ) : (
                        <Clock size={19} className="amber" />
                      )}
                      <div>
                        <strong>
                          {s.status === "Resolved"
                            ? "Recovery confirmed"
                            : s.approval
                              ? "Reviewer approved"
                              : data.blockers.length
                                ? "Closure is blocked"
                                : "Ready for reviewer"}
                        </strong>
                        <small>
                          {s.approval
                            ? "Exact revision " +
                              s.approval.revision +
                              " approved"
                            : "Evidence and a separate reviewer required"}
                        </small>
                      </div>
                    </div>
                    <div className="approval-checks">
                      <div>
                        <span
                          className={
                            s.linked.length >= 3 ? "check good" : "check"
                          }
                        >
                          <Check size={10} />
                        </span>
                        Corroborated incident reports
                      </div>
                      <div>
                        <span className={s.analysis ? "check good" : "check"}>
                          <Check size={10} />
                        </span>
                        Reviewed investigation
                      </div>
                      <div>
                        <span
                          className={
                            data.readyProbeIds.length === 2
                              ? "check good"
                              : "check"
                          }
                        >
                          <Check size={10} />
                        </span>
                        Two fresh passing queries
                      </div>
                      <div>
                        <span className={s.approval ? "check good" : "check"}>
                          <Check size={10} />
                        </span>
                        Independent reviewer approval
                      </div>
                    </div>
                    {data.blockers.length > 0 && (
                      <div className="blocked-reason">
                        {data.blockers.map((b) => (
                          <p key={b}>{b}</p>
                        ))}
                      </div>
                    )}
                    {s.approval && (
                      <p className="approval-receipt mono">
                        {s.approval.reviewer}
                        <br />
                        Expires {time(s.approval.expires)}
                        <br />
                        {s.approval.probeIds.join(" · ")}
                      </p>
                    )}
                    <button
                      className="secondary full"
                      disabled={
                        !!busy ||
                        session.role !== "reviewer" ||
                        data.blockers.length > 0 ||
                        s.status === "Resolved"
                      }
                      onClick={() =>
                        act("approve", {
                          revision: s.revision,
                          probeIds: data.readyProbeIds,
                          target: data.target,
                          transition: data.transition,
                          targetStatus: data.targetStatus,
                        })
                      }
                    >
                      <ShieldCheck size={14} /> Approve revision {s.revision}
                    </button>
                    <button
                      className="primary full"
                      disabled={
                        !!busy ||
                        !isOperator ||
                        !s.approval ||
                        data.blockers.length > 0 ||
                        s.status === "Resolved"
                      }
                      onClick={() =>
                        act("execute", { approvalKey: s.approval?.key })
                      }
                    >
                      <ArrowUpRight size={14} />
                      {s.action?.state === "Unconfirmed"
                        ? "Reconcile update"
                        : "Apply approved update"}
                    </button>
                    <p className="approval-target mono">
                      TARGET {data.target} → {data.targetStatus} ·{" "}
                      {data.transition}
                    </p>
                    {s.action && (
                      <div
                        className={
                          "action-receipt " +
                          (s.action.state === "Confirmed" ? "confirmed" : "")
                        }
                      >
                        <strong>{s.action.label}</strong>
                        <p>
                          {s.action.state} · {s.action.issue} ·{" "}
                          {s.action.status}
                        </p>
                        <small>
                          {s.action.detail}
                          <br />
                          {stamp(s.action.at)}
                        </small>
                      </div>
                    )}
                  </div>
                </section>
              </aside>
            </div>
          )}
          <footer className="page-footer">
            <span>
              <i className="green-dot" /> All activity is recorded
            </span>
            <span>
              FICTIONAL STUDENT DATA <span> / </span> APU CLOUD INNOVATION
              HACKATHON
            </span>
            <span>
              FixPilot AI <span>v1.0</span>
            </span>
          </footer>
        </main>
      </div>
      {importOpen && (
        <div className="modal-backdrop">
          <dialog
            className="modal"
            ref={(node) => {
              if (node && !node.open) node.showModal();
            }}
            onCancel={() => setImportOpen(false)}
            aria-labelledby="import-title"
          >
            <div className="panel-heading">
              <h2 id="import-title">Import reviewed investigation</h2>
              <button
                className="icon-button"
                aria-label="Close import"
                onClick={() => setImportOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p className="muted">
                Export the current bundle first. Only supplied evidence and
                runbook IDs are accepted.
              </p>
              <label>
                Analysis source
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <option>Enterprise manual import</option>
                  <option>Fixture</option>
                </select>
              </label>
              <label>
                Run reference (if provided)
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Enterprise workflow run reference"
                />
              </label>
              <label>
                Reviewed JSON
                <textarea
                  rows={13}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder='{"bundleId": "FP-001-r1", …}'
                />
              </label>
              {error && <p className="error">{error}</p>}
              <button
                className="primary full"
                disabled={!!busy}
                onClick={async () => {
                  try {
                    const json = JSON.parse(raw);
                    if (
                      await act("analysis", {
                        analysis: json,
                        source,
                        runReference: reference,
                      })
                    ) {
                      setImportOpen(false);
                      setTab("Analysis");
                    }
                  } catch {
                    setError("Paste valid JSON before importing.");
                  }
                }}
              >
                <Upload size={14} /> Validate & import analysis
              </button>
            </div>
          </dialog>
        </div>
      )}
    </div>
  );
}
function ProbeView({ last }: { last?: State["probes"][number] }) {
  return (
    <div className="probe-grid">
      <div className="probe-card">
        <div>
          <Activity size={14} />
          <span>Service health</span>
          <span
            className={
              "probe-code " +
              (last?.health === 200 ? "green" : last ? "amber" : "")
            }
          >
            {last ? last.health || "TIMEOUT" : "—"}
          </span>
        </div>
        <strong>
          {last
            ? last.health === 200
              ? "Endpoint healthy"
              : "Endpoint unavailable"
            : "Awaiting check"}
        </strong>
        <span className="mono">GET /aida/health</span>
        <div className={"sparkline " + (last?.health === 200 ? "success" : "")}>
          {[7, 7, 12, 7, 7, 27, 4, 7, 7, 7, 18, 7, 7, 7, 7, 7, 7, 7, 7, 7].map(
            (h, i) => (
              <i key={i} style={{ height: h }} />
            ),
          )}
        </div>
      </div>
      <div className="probe-card">
        <div>
          <Terminal size={14} />
          <span>Student query</span>
          <span
            className={
              "probe-code " + (last?.expected ? "green" : last ? "amber" : "")
            }
          >
            {last ? last.query || "TIMEOUT" : "—"}
          </span>
        </div>
        <strong>
          {last
            ? last.expected
              ? "Expected reply received"
              : "No expected reply"
            : "Awaiting check"}
        </strong>
        <span className="mono">POST /aida/query</span>
        <div className={"sparkline " + (last?.expected ? "success" : "")}>
          {[7, 7, 7, 7, 13, 7, 7, 27, 4, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7].map(
            (h, i) => (
              <i key={i} style={{ height: h }} />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
