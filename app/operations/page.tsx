"use client";
import { useEffect, useRef, useState } from "react";
import ServiceWorkspace from "../components/service-workspace";
import RoleDashboard from "../components/role-dashboard";
import PushNotifications from "../components/push-notifications";
import SmartIntake from "../components/smart-intake";
import EvidenceReviewPanel from "../components/evidence-review";
import CampusMap from "../components/campus-map";
import IssueTimeline from "../components/issue-timeline";
import ReportEvidenceUpload from "../components/report-evidence-upload";
import { uploadEvidence } from "../../lib/upload-evidence";
import { presentationData } from "../../lib/demo-data";
import {
  Plus,
  Ticket,
  LogOut,
  ArrowRight,
  Check,
  Paperclip,
  X,
  Bell,
} from "lucide-react";
const time = (n: number) =>
  new Date(n).toLocaleString("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const progress = (s: string, confirmed = false) =>
  confirmed || s === "Closed"
    ? "Confirmed"
    : {
        Resolved: "Resolved",
        Verifying: "Staff review",
        Assigned: "Assigned",
        "Needs triage": "Reported",
        Investigating: "In progress",
        "Waiting Parts": "Waiting for parts",
      }[s] || s;
export default function Operations() {
  const [demoEnabled, setDemoEnabled] = useState(false);
  const draftRequestId = useRef("");
  const historyReady = useRef(false);
  const [liveData, setData] = useState<any>(null),
    [view, setView] = useState(""),
    [selected, setSelected] = useState(""),
    [queueFilter, setQueueFilter] = useState("All"),
    [creating, setCreating] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uploadingIssue, setUploadingIssue] = useState(false),
    [uploadPercent, setUploadPercent] = useState(0),
    [uploadLabel, setUploadLabel] = useState(""),
    [suggestions, setSuggestions] = useState<any>(null),
    [assistanceId, setAssistanceId] = useState<string | undefined>();
  async function load() {
    const r = await fetch("/api/coordination");
    if (r.status === 401) {
      location.href = "/";
      return;
    }
    const d = await r.json();
    if (!r.ok) {
      setError(d.error);
      return;
    }
    setData(d);
    const notification = new URLSearchParams(location.search).get(
      "notification",
    );
    if (notification) {
      const n = d.notifications?.find((n: any) => n.id === notification);
      if (n?.issue) {
        setSelected(n.issue);
        setQueueFilter("All");
        setView(
          d.user.role === "reporter"
            ? "My Issues"
            : d.user.role === "operator"
              ? "My Tasks"
              : "Issues",
        );
      }
      history.replaceState({}, "", "/operations");
    }
  }
  useEffect(() => {
    load().catch(() => setError("Connection lost"));
    const t = setInterval(() => load().catch(() => {}), 5000);
    return () => clearInterval(t);
  }, []);
  // Keep in-app screens in browser history so mobile Back restores the workspace.
  useEffect(() => {
    const restore = () => {
      const screen = history.state?.fixpilotScreen;
      if (!screen) return;
      setView(screen.view || "");
      setSelected(screen.selected || "");
      setQueueFilter(screen.queueFilter || "All");
      setCreating(!!screen.creating);
      setDemoEnabled(!!screen.demoEnabled);
      setError("");
    };
    restore();
    if (!history.state?.fixpilotScreen) history.replaceState({ ...history.state, fixpilotScreen: { view: "", selected: "", queueFilter: "All", creating: false, demoEnabled: false } }, "", location.href);
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    if (!historyReady.current) { historyReady.current = true; return; }
    const screen = { view, selected, queueFilter, creating, demoEnabled };
    const previous = history.state?.fixpilotScreen;
    if (JSON.stringify(previous) === JSON.stringify(screen)) return;
    const state = { ...history.state, fixpilotScreen: screen };
    if (previous) history.pushState(state, "", location.href);
    else history.replaceState(state, "", location.href);
  }, [view, selected, queueFilter, creating, demoEnabled]);
  async function act(body: any) {
    if (demoEnabled) {
      setError("Presentation demo is read-only. Switch to live data to save changes.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const r = await fetch("/api/coordination", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      await load();
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }
  const data = liveData && (demoEnabled ? presentationData(liveData) : liveData);
  if (!data)
    return <div className="loading">{error || "Opening workspace…"}</div>;
  const user = data.user.role === "reporter",
    technician = data.user.role === "operator",
    tab = view || "Dashboard";
  const nav = user
    ? ["Dashboard", "My Issues", "Notifications", "Profile"]
    : technician
      ? ["Dashboard", "My Tasks", "Campus Map", "Notifications", "Profile"]
      : ["Dashboard", "Issues", "Assignments", "Team", "Campus Map", "Notifications"];
  const issues = data.issues || [];
  const visibleIssues = issues.filter(
    (i: any) =>
      queueFilter === "All" ||
      (queueFilter === "Open"
        ? !["Resolved", "Closed"].includes(i.status)
        : queueFilter === "Working"
          ? ["Investigating", "Waiting Parts"].includes(i.status)
          : i.status === queueFilter),
  );
  function navigate(tab: string, filter = "All") {
    setView(tab);
    setSelected("");
    setQueueFilter(filter);
  }
  function openItem(id: string) {
    setSelected(id);
    setQueueFilter("All");
    setView(user ? "My Issues" : technician ? "My Tasks" : "Issues");
  }

  const issue =
    visibleIssues.find((r: any) => r.id === selected) || visibleIssues[0];
  const historicalNotifications = issues
    .flatMap((r: any) =>
      r.updates.map((u: any) => ({ ...u, title: r.summary, issue: r.id })),
    )
    .sort((a: any, b: any) => b.at - a.at);
  const notifications = [
    ...(data.notifications || []),
    ...historicalNotifications.filter(
      (old: any) =>
        !(data.notifications || []).some(
          (n: any) => n.text === old.text && n.at === old.at,
        ),
    ),
  ].sort((a: any, b: any) => b.at - a.at);
  return (
    <div className="app-shell mission">
      <aside className="sidebar">
        <a href="/operations" className="brand">
          <img src="/icon.svg" width="29" height="29" alt="FixPilot" />
          fixpilot
        </a>
        <div className="ops-workspace">
          <strong>
            {user
              ? "Student portal"
              : technician
                ? "Technician"
                : data.user.role === "admin"
                  ? "Administration"
                  : "Department staff"}
          </strong>
        </div>
        <nav>
          {nav.map((n) => (
            <button
              key={n}
              className={"nav-item " + (tab === n ? "active" : "")}
              onClick={() => {
                navigate(n);
              }}
            >
              {n}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="profile"
            aria-label="Sign out"
            onClick={async () => {
              if ("serviceWorker" in navigator) {
                try {
                  const r = await navigator.serviceWorker.getRegistration("/");
                  const sub = await r?.pushManager.getSubscription();
                  if (sub) {
                    await fetch("/api/notifications", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "unsubscribe",
                        endpoint: sub.endpoint,
                      }),
                    });
                    await sub.unsubscribe();
                  }
                } catch {}
              }
              await fetch("/api/logout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              });
              location.href = "/";
            }}
          >
            <span className="avatar">{data.user.name[0]}</span>
            <span>
              {data.user.name}
              <small>
                {user
                  ? "Student / User"
                  : technician
                    ? "Technician"
                    : data.user.role === "admin" ? "Administrator" : "Department Staff"}
              </small>
            </span>
            <LogOut size={14} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div style={{ paddingLeft: 20 }}>
            FixPilot <ArrowRight size={13} />
            {tab}
          </div>
          <span className="mono muted">DEMO</span>
        </header>
        <main className="content">
          <div className="page-heading">
            <h1>{tab}</h1>
            <button className="secondary presentation-toggle" disabled={busy || uploadingIssue} aria-pressed={demoEnabled}
              onClick={() => {
                setDemoEnabled(!demoEnabled); setSelected(""); setView("Dashboard");
                setCreating(false); setError("");
              }}>
              {demoEnabled ? "Switch to live data" : "Presentation demo"}
            </button>
            {user && (
              <button className="primary" disabled={demoEnabled} onClick={() => setCreating(true)}>
                <Plus size={15} />
                Report New Issue
              </button>
            )}
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss">
                <X size={14} />
              </button>
            </div>
          )}
          {demoEnabled && <div className="demo-banner" role="status">
            Presentation demo · Fictional records · Read-only · Live reports are separate
          </div>}
          {tab === "Campus Map" && !user ? (
            <CampusMap data={data} onOpen={openItem} />
          ) : tab === "Dashboard" ? (
            <RoleDashboard
              data={data}
              onNavigate={navigate}
              onOpen={openItem}
              onCreate={() => demoEnabled ? setError("Switch to live data to submit a report.") : setCreating(true)}
            />
          ) : user ? (
            tab === "Profile" ? (
              <section className="panel mission-profile">
                <h2>{data.user.name}</h2>
                <p>{data.user.id}</p>
                {data.user.tpNumber && <p>TP number: {data.user.tpNumber}</p>}
                <PushNotifications available={data.pushAvailable} />
                <button
                  className="secondary"
                  onClick={() => navigate("My Issues")}
                >
                  My Issues
                </button>
              </section>
            ) : tab === "Notifications" ? (
              <section className="panel">
                <PushNotifications available={data.pushAvailable} />
                {notifications.length ? (
                  notifications.map((n: any) => (
                    <button
                      className="mission-notification"
                      key={n.issue + n.id}
                      onClick={() => {
                        openItem(n.issue);
                      }}
                    >
                      <Bell size={17} />
                      <div>
                        <strong>{n.title}</strong>
                        <p>{n.text}</p>
                        <time>{time(n.at)}</time>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="empty">No updates yet</div>
                )}
              </section>
            ) : (
              <div
                className={
                  "mission-grid student-issues " +
                  (selected ? "has-selection" : "")
                }
              >
                <section className="panel mission-queue">
                  {queueFilter !== "All" && (
                    <button
                      className="dashboard-clear"
                      onClick={() => setQueueFilter("All")}
                    >
                      Showing{" "}
                      {queueFilter === "Working"
                        ? "in progress"
                        : progress(queueFilter)}{" "}
                      · Show all
                    </button>
                  )}
                  {visibleIssues.length ? (
                    visibleIssues.map((r: any) => (
                      <button
                        key={r.id}
                        className={
                          "mission-row " +
                          (issue?.id === r.id ? "selected" : "")
                        }
                        onClick={() => setSelected(r.id)}
                      >
                        <strong>{r.summary}</strong>
                        <span>{r.location}</span>
                        <div>
                          <span className="status">
                            {progress(r.status, r.confirmed)}
                          </span>
                          <time>{time(r.at)}</time>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="empty">
                      <Ticket size={28} />
                      <h2>No open problems</h2>
                      <button
                        className="primary"
                        onClick={() => setCreating(true)}
                      >
                        Report New Issue
                      </button>
                    </div>
                  )}
                </section>
                {issue && (
                  <section className="panel mission-detail">
                    <button
                      className="secondary student-back"
                      onClick={() => setSelected("")}
                    >
                      ← My Issues
                    </button>
                    <header>
                      <span className="issue-reference">Issue {issue.id}</span>
                      <span className="status">
                        {progress(issue.status, issue.confirmed)}
                      </span>
                    </header>
                    <h2>{issue.summary}</h2>
                    <dl className="issue-facts">
                      <div>
                        <dt>Priority</dt>
                        <dd>{issue.priority}</dd>
                      </div>
                      <div>
                        <dt>Service</dt>
                        <dd>{issue.category}</dd>
                      </div>
                      <div>
                        <dt>Location</dt>
                        <dd>{issue.location || "Not provided"}</dd>
                      </div>
                      <div>
                        <dt>Department</dt>
                        <dd>{issue.team || "Awaiting assignment"}</dd>
                      </div>
                      <div>
                        <dt>Technician</dt>
                        <dd>{issue.technician || "Awaiting assignment"}</dd>
                      </div>
                      <div>
                        <dt>Estimated resolution</dt>
                        <dd>
                          {issue.eta == null
                            ? "Awaiting estimate"
                            : `${issue.eta} minutes`}
                        </dd>
                      </div>
                      <div>
                        <dt>Submitted · MYT</dt>
                        <dd>{time(issue.at)}</dd>
                      </div>
                      <div>
                        <dt>Last updated · MYT</dt>
                        <dd>{time(issue.updated || issue.at)}</dd>
                      </div>
                    </dl>
                    <p className="service-next">
                      {issue.confirmed
                        ? "You confirmed this issue is solved."
                        : issue.status === "Needs triage"
                          ? "Your department is reviewing the issue and will assign a technician."
                          : issue.status === "Assigned"
                            ? "A technician has been assigned. Work will start shortly."
                            : issue.status === "Verifying"
                              ? "The technician has finished. Department staff are checking the repair."
                              : issue.status === "Resolved"
                                ? "The repair has been approved. Please confirm whether your problem is solved."
                                : issue.status === "Waiting Parts"
                                  ? "The technician is waiting for parts. Updates will appear here."
                                  : "Your technician is working on the issue."}
                    </p>
                    {issue.automation && (
                      <section className="automation-summary">
                        <strong>{issue.automation.source} · {issue.automation.state === "assigned" ? "Automatically assigned" : issue.automation.state === "manual" ? "Staff assignment" : "Staff review needed"}</strong>
                        <p>{issue.automation.reason}</p>
                      </section>
                    )}
                    <h3 className="issue-section-title">Progress</h3>
                    <ol className="delivery-track">
                      {[
                        "Reported",
                        "Assigned",
                        "In progress",
                        "Resolved",
                        "Confirmed",
                      ].map((label, i) => {
                        const step = issue.confirmed
                          ? 4
                          : issue.status === "Closed"
                            ? 4
                            : issue.status === "Resolved"
                              ? 3
                              : issue.status === "Needs triage"
                                ? 0
                                : issue.status === "Assigned"
                                  ? 1
                                  : 2;
                        return (
                          <li key={label} className={i <= step ? "done" : ""}>
                            <span>
                              {i < step ? <Check size={12} /> : i + 1}
                            </span>
                            {label}
                          </li>
                        );
                      })}
                    </ol>
                    <section className="issue-section">
                      <h3 className="issue-section-title">Description</h3>
                      <p className="mission-description">
                        {issue.detail || "No description provided."}
                      </p>
                    </section>
                    <section className="issue-section">
                      <h3 className="issue-section-title">
                        Evidence <span>{issue.attachments?.length || 0}</span>
                      </h3>
                      {issue.attachments?.length ? (
                        <div className="issue-evidence-grid">
                          {issue.attachments.map((a: any) => (
                            <div className="issue-attachment" key={a.id}>
                              {a.type?.startsWith("image/") && (
                                <a
                                  href={"/api/evidence/" + a.id}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <img
                                    src={"/api/evidence/" + a.id}
                                    alt={a.name}
                                    loading="lazy"
                                  />
                                </a>
                              )}
                              {a.type?.startsWith("video/") && (
                                <video
                                  src={"/api/evidence/" + a.id}
                                  controls
                                  preload="metadata"
                                  aria-label={a.name}
                                />
                              )}
                              <a
                                className="evidence-file"
                                href={"/api/evidence/" + a.id}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <Paperclip size={14} />
                                <span>
                                  {a.name}
                                  <small>
                                    {a.type?.split("/")[1]?.toUpperCase()} ·{" "}
                                    {a.size < 1048576
                                      ? `${Math.max(1, Math.round(a.size / 1024))} KB`
                                      : `${(a.size / 1048576).toFixed(1)} MB`}
                                  </small>
                                </span>
                              </a>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="issue-empty">No attachments</p>
                      )}
                    </section>
                    <EvidenceReviewPanel
                      reportId={issue.id}
                      review={issue.evidenceReview}
                      hasMedia={(issue.attachments || []).some((attachment: any) =>
                        (!attachment.purpose || attachment.purpose === "attachment") &&
                        /^(image|video)\//.test(attachment.type)
                      )}
                      refresh={load}
                    />
                    <ReportEvidenceUpload key={issue.id} reportId={issue.id} demo={demoEnabled} refresh={load} />
                    <IssueTimeline issue={issue} attachments={issue.attachments || []} />
                    {!issue.confirmed && issue.status === "Resolved" && (
                      <div className="service-photo-actions">
                        <button
                          disabled={busy}
                          className="primary service-action"
                          onClick={() =>
                            act({ action: "confirm", id: issue.id })
                          }
                        >
                          <Check size={18} />
                          Problem solved
                        </button>
                        <button
                          disabled={busy}
                          className="secondary service-action"
                          onClick={() =>
                            act({ action: "reopen", id: issue.id })
                          }
                        >
                          Still not fixed
                        </button>
                      </div>
                    )}
                    {issue.confirmed && (
                      <button
                        disabled={busy}
                        className="secondary service-action"
                        onClick={() => act({ action: "reopen", id: issue.id })}
                      >
                        Reopen issue
                      </button>
                    )}
                  </section>
                )}
              </div>
            )
          ) : (
            <ServiceWorkspace
              key={tab + selected + queueFilter}
              initialSelected={selected}
              initialFilter={queueFilter === "All" ? "Open" : queueFilter}
              data={data}
              tab={tab}
              act={act}
              busy={busy || demoEnabled}
              refresh={load}
            />
          )}
        </main>
        {user && !creating && <button className="primary mobile-report" disabled={demoEnabled || busy || uploadingIssue} onClick={() => setCreating(true)}><Plus size={18} />Report issue</button>}
      </div>
      {creating && (
        <dialog
          className="mission-compose"
          ref={(n) => {
            if (n && !n.open) n.showModal();
          }}
          onCancel={(event) => { if (busy || uploadingIssue) event.preventDefault(); else setCreating(false); }}
        >
          <header>
            <h2>Report New Issue</h2>
            <button
              className="icon-button"
              aria-label="Close"
              disabled={busy || uploadingIssue}
              onClick={() => setCreating(false)}
            >
              <X size={18} />
            </button>
          </header>
          {uploadingIssue && <div className="upload-status" role="status"><strong>{uploadLabel}</strong><progress aria-label="Report evidence upload" max={100} value={uploadPercent} /><span>{uploadPercent}%{uploadPercent === 100 ? " · Saving evidence…" : " · Uploading…"}</span></div>}
          <form
            inert={busy || uploadingIssue}
            onChange={() => {
              setSuggestions(null);
              setAssistanceId(undefined);
              draftRequestId.current = "";
            }}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              const button = (e.nativeEvent as SubmitEvent)
                .submitter as HTMLButtonElement | null;
              const existingCase = button?.dataset.existing;
              if (!existingCase && !button?.dataset.separate) {
                const checked = await act({
                  action: "suggest",
                  summary: f.get("summary"),
                  detail: f.get("detail"),
                  location: f.get("location"),
                  category: f.get("category"),
                });
                if (!checked) return;
                if (checked.matches?.length) {
                  setSuggestions(checked);
                  return;
                }
              }
              if (!draftRequestId.current) draftRequestId.current = crypto.randomUUID();
              const result = await act({
                action: "report",
                requestId: draftRequestId.current,
                assistanceId,
                ...(existingCase ? { existingCase } : {}),
                summary: f.get("summary"),
                detail: f.get("detail"),
                location: f.get("location"),
                category: f.get("category"),
              });
              if (!result) return;
              const id = result.report.id;
              setUploadingIssue(true);
              const files = f
                .getAll("files")
                .filter((x): x is File => x instanceof File && x.size > 0);
              try {
                for (const [index, file] of files.entries()) {
                  setUploadLabel(`File ${index + 1} of ${files.length}: ${file.name}`);
                  const upload = new FormData();
                  upload.set("file", file);
                  upload.set("reportId", id);
                  await uploadEvidence(upload, setUploadPercent);
                }
              } catch (failure) {
                setError(failure instanceof Error ? "Issue saved. " + failure.message : "Issue saved. An attachment could not be uploaded.");
              } finally {
                setUploadingIssue(false);
              }
              setCreating(false);
              setSuggestions(null);
              setAssistanceId(undefined);
              draftRequestId.current = "";
              setSelected(id);
              setQueueFilter("All");
              setView(user ? "My Issues" : "Reports");
              await load();
            }}
          >
            <SmartIntake onApplied={setAssistanceId} />
            <label>
              Category
              <select name="category" defaultValue="Other">
                <option value="Other">Detect automatically</option>
                {[
                  "Furniture",
                  "Cleaning",
                  "Accommodation",
                  "Classroom",
                  "Electrical",
                  "Water",
                  "Internet",
                  "Software",
                  "Wi-Fi",
                  "Printer",
                  "LMS",
                  "Lab Computer",
                  "Software Access",
                  "Network",
                  "Email",
                  "AIDA",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Issue title
              <input
                name="summary"
                required
                minLength={5}
                maxLength={180}
                placeholder="What isn’t working?"
              />
            </label>
            <label>
              Description
              <textarea
                name="detail"
                required
                minLength={10}
                maxLength={2000}
                rows={4}
                placeholder="Describe the problem"
              />
            </label>
            <label>
              Location
              <input
                name="location"
                required
                minLength={2}
                maxLength={80}
                placeholder="Building, room or location"
              />
            </label>
            <label className="mission-upload">
              <Paperclip size={17} />
              Attach evidence
              <input
                type="file"
                name="files"
                multiple
                accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,application/pdf"
              />
              <small>Images, video or PDF · 3 MB each</small>
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {suggestions && (
              <section className="duplicate-options">
                <h3>Possible matching issue</h3>
                <p>
                  Rule-based suggestions. Choose whether this is the same
                  problem.
                </p>
                {suggestions.matches.map((m: any) => (
                  <article key={m.id}>
                    <strong>
                      {m.service} · {m.location}
                    </strong>
                    <p>{m.reason}</p>
                    <span>
                      {m.team} · {progress(m.status)}
                    </span>
                    <button
                      className="primary full"
                      type={m.ownIssue ? "button" : "submit"}
                      onClick={
                        m.ownIssue
                          ? () => {
                              setCreating(false);
                              setSuggestions(null);
                              openItem(m.ownIssue);
                            }
                          : undefined
                      }
                      data-existing={m.id}
                      disabled={busy || uploadingIssue}
                    >
                      {m.ownIssue ? "Track my issue" : "Join this issue"}
                    </button>
                  </article>
                ))}
                <button
                  type="submit"
                  data-separate="true"
                  className="secondary full"
                  disabled={busy || uploadingIssue}
                >
                  Submit separately
                </button>
              </section>
            )}
            {!suggestions && (
              <button
                className="primary full"
                disabled={busy || uploadingIssue}
              >
                {busy ? "Detecting and routing…" : uploadingIssue ? "Uploading evidence…" : "Submit and route issue"} <ArrowRight size={15} />
              </button>
            )}
          </form>
        </dialog>
      )}
    </div>
  );
}
