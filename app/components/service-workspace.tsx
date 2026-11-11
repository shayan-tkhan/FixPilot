"use client";
import { useState } from "react";
import { accounts } from "../../lib/accounts";
import EvidenceReviewPanel from "./evidence-review";
import RepairReviewPanel from "./repair-review";
import IssueTimeline from "./issue-timeline";
import ResponseDeadline from "./response-deadline";
import { uploadEvidence } from "../../lib/upload-evidence";
import PushNotifications from "./push-notifications";
import { ArrowLeft, Camera, Check, MapPin, Play, Upload } from "lucide-react";
const date = (n: number) =>
  new Date(n).toLocaleString("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const status = (s: string) =>
  ({
    "Needs triage": "New",
    Investigating: "In progress",
    Verifying: "Awaiting review",
    Closed: "Confirmed",
  })[s] || s;

type DirectoryMember = { id: string; name: string; role: string };
type TeamIssue = {
  id: string;
  owner: string;
  team: string;
  title: string;
  status: string;
};

const isCompleted = (issue: TeamIssue) =>
  ["Resolved", "Closed"].includes(issue.status);

const homeTeams = new Map<string, readonly string[]>(
  accounts
    .filter((account) => account.role === "operator")
    .map((account) => [account.id, account.teams]),
);

function TechnicianProfile({
  member,
  issues,
  onOpen,
}: {
  member: DirectoryMember;
  issues: TeamIssue[];
  onOpen: (id: string) => void;
}) {
  const completed = issues.filter(isCompleted);
  const active = issues.filter((issue) => !isCompleted(issue));
  const work = [
    { label: "Active assignments", issues: active },
    { label: "Completed work", issues: completed },
  ];

  return (
    <details className="service-options">
      <summary>
        <strong>{member.name}</strong> · Technician
        <span style={{ display: "block" }}>
          {active.length} active · {completed.length} completed
        </span>
      </summary>
      <p style={{ overflowWrap: "anywhere" }}>{member.id}</p>
      {work.map((group) => (
        <section key={group.label}>
          <h3>{group.label} ({group.issues.length})</h3>
          {group.issues.length ? (
            <ul>
              {group.issues.map((issue) => (
                <li key={issue.id}>
                  <button
                    type="button"
                    className="secondary"
                    style={{ width: "100%", textAlign: "left", whiteSpace: "normal" }}
                    onClick={() => onOpen(issue.id)}
                  >
                    {issue.title} · {status(issue.status)}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>No {group.label.toLowerCase()}.</p>
          )}
        </section>
      ))}
    </details>
  );
}
export default function ServiceWorkspace({
  data,
  tab,
  act,
  busy,
  refresh,
  initialSelected = "",
  initialFilter = "Open",
}: {
  initialSelected?: string;
  initialFilter?: string;
  data: any;
  tab: string;
  act: (body: any) => Promise<any>;
  busy: boolean;
  refresh: () => Promise<void>;
}) {
  const technician = data.user.role === "operator";
  const [selected, setSelected] = useState(initialSelected);
  const [filter, setFilter] = useState(initialFilter);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [repairNote, setRepairNote] = useState("");
  const [aiBusy, setAiBusy] = useState(false),
    [aiError, setAiError] = useState(""),
    [draft, setDraft] = useState("");
  async function assist(intent: string) {
    if (data.demo) {
      setAiError("Presentation demo is read-only. Switch to live data to run AI.");
      return;
    }
    if (!task) return;
    setAiError("");
    setAiBusy(true);
    try {
      const f = new FormData();
      f.set("intent", intent);
      f.set("id", task.id);
      f.set("text", repairNote);
      const r = await fetch("/api/assist", { method: "POST", body: f });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (intent === "draft") setDraft(d.text);
      else await refresh();
    } catch (e) {
      setAiError(
        e instanceof Error ? e.message : "Could not generate suggestion",
      );
    } finally {
      setAiBusy(false);
    }
  }
  const who = (id: string) =>
    data.directory?.find((a: any) => a.id === id)?.name || id;
  const all = (data.cases || []).filter(
    (c: any) => tab !== "Assignments" || c.owner !== "Unassigned",
  );
  const task = all.find((c: any) => c.id === selected);
  const matches = (c: any) =>
    filter === "All" ||
    (filter === "Overdue"
      ? c.overdue
      : filter === "Working"
        ? ["Investigating", "Waiting Parts"].includes(c.status)
        : filter === "TodayCompleted"
          ? c.updates.some(
              (u: any) =>
                u.text.startsWith("Repair submitted for staff review.") &&
                new Date(u.at).toLocaleDateString("en-CA", {
                  timeZone: "Asia/Kuala_Lumpur",
                }) ===
                  new Date().toLocaleDateString("en-CA", {
                    timeZone: "Asia/Kuala_Lumpur",
                  }),
            )
          : filter === "TodayResolved"
            ? c.resolvedAt &&
              new Date(c.resolvedAt).toLocaleDateString("en-CA", {
                timeZone: "Asia/Kuala_Lumpur",
              }) ===
                new Date().toLocaleDateString("en-CA", {
                  timeZone: "Asia/Kuala_Lumpur",
                })
            : filter === "Open"
              ? !["Resolved", "Closed"].includes(c.status)
              : filter === "Urgent"
                ? ["High", "Critical"].includes(c.severity) &&
                  !["Resolved", "Closed"].includes(c.status)
                : filter === "Completed"
                  ? ["Verifying", "Resolved", "Closed"].includes(c.status)
                  : c.status === filter);
  const tasks = all.filter(matches);
  if (tab === "Profile")
    return (
      <section className="panel service-profile">
        <h2>{data.user.name}</h2>
        <p>{data.user.id}</p>
        <span>Technician</span>
        <PushNotifications available={data.pushAvailable} />
      </section>
    );
  if (tab === "Team" && !task) {
    const members = (data.directory as DirectoryMember[]).filter(
      (member) => member.role === "operator",
    );
    const issues: TeamIssue[] = all;
    const teams = new Set<string>(data.teams);
    const memberIds = new Set(members.map((member) => member.id));
    const assigned = new Set<string>();
    for (const member of members) {
      for (const team of homeTeams.get(member.id) || []) {
        teams.add(team);
        assigned.add(member.id);
      }
    }
    for (const issue of issues) {
      if (memberIds.has(issue.owner) && issue.team) {
        teams.add(issue.team);
        assigned.add(issue.owner);
      }
    }
    const unassigned = members.filter((member) => !assigned.has(member.id));

    return (
      <section aria-label="Technicians by team">
        <p className="service-hint">
          View each department's technicians and their work. Technicians also appear
          under other teams where they have assigned issues.
        </p>
        <div className="service-cards">
          {[...teams].map((team) => {
            const teamIssues = issues.filter((issue) => issue.team === team);
            const roster = members
              .map((member) => ({
                member,
                issues: teamIssues.filter((issue) => issue.owner === member.id),
              }))
              .filter(
                (profile) => profile.issues.length ||
                  homeTeams.get(profile.member.id)?.includes(team),
              );

            return (
              <section className="panel service-profile" key={team}>
                <h2>{team}</h2>
                <p>{teamIssues.filter((issue) => !isCompleted(issue)).length} open issues</p>
                {roster.length ? (
                  roster.map(({ member, issues }) => (
                    <TechnicianProfile
                      key={member.id}
                      member={member}
                      issues={issues}
                      onOpen={setSelected}
                    />
                  ))
                ) : (
                  <p>No technicians assigned to issues in this team.</p>
                )}
              </section>
            );
          })}
          {unassigned.length > 0 && (
            <section className="panel service-profile">
              <h2>No team assignments yet</h2>
              {unassigned.map((member) => (
                <TechnicianProfile
                  key={member.id}
                  member={member}
                  issues={issues.filter((issue) => issue.owner === member.id)}
                  onOpen={setSelected}
                />
              ))}
            </section>
          )}
        </div>
      </section>
    );
  }
  if (tab === "Notifications" && !task)
    return (
      <section className="panel service-updates">
        <PushNotifications available={data.pushAvailable} />
        {(data.notifications || []).map((n: any) => (
          <article key={n.id}>
            <button
              className="notification-open"
              onClick={() => {
                setSelected(n.issue);
                setFilter("All");
              }}
            >
              <strong>{n.title}</strong>
              <p>{n.text}</p>
              <time>{date(n.at)} MYT</time>
            </button>
          </article>
        ))}
        {!data.notifications?.length && <p>No notifications yet</p>}
      </section>
    );
  if (!task)
    return (
      <>
        {![
          "Open",
          "All",
          "Urgent",
          "Completed",
          "Needs triage",
          "Assigned",
          "Verifying",
        ].includes(filter) && (
          <button className="dashboard-clear" onClick={() => setFilter("Open")}>
            Filtered tasks · Show all open
          </button>
        )}
        <div className="service-filters" aria-label="Filter issues">
          {(technician
            ? [
                ["Open", "My tasks"],
                ["Urgent", "Urgent"],
                ["Completed", "Completed"],
                ["Overdue", "Overdue"],
              ]
            : [
                ["Open", "Open"],
                ["Needs triage", "New"],
                ["Assigned", "Assigned"],
                ["Verifying", "Awaiting review"],
                ["All", "All"],
                ["Overdue", "Overdue"],
              ]
          ).map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
              <span>
                {
                  all.filter(
                    (c: any) =>
                      value === "All" ||
                      (value === "Overdue"
                        ? c.overdue
                        : value === "Open"
                          ? !["Resolved", "Closed"].includes(c.status)
                          : value === "Urgent"
                            ? ["High", "Critical"].includes(c.severity) &&
                              !["Resolved", "Closed"].includes(c.status)
                            : value === "Completed"
                              ? ["Verifying", "Resolved", "Closed"].includes(
                                  c.status,
                                )
                              : c.status === value),
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        <div className="service-cards">
          {tasks.map((c: any) => (
            <button
              className="panel service-card"
              key={c.id}
              onClick={() => setSelected(c.id)}
            >
              <div className="service-card-top">
                <span className="status">
                  {c.overdue ? "Overdue" : status(c.status)}
                </span>
                {["High", "Critical"].includes(c.severity) && (
                  <span className="service-priority">{c.severity}</span>
                )}
              </div>
              <h2>{c.title}</h2>
              <ResponseDeadline issue={c} compact />
              <p>
                <MapPin size={17} />
                {c.location}
              </p>
              <div className="service-card-bottom">
                <span>{c.team}</span>
                <strong>{technician ? "View task" : "Review issue"} →</strong>
              </div>
            </button>
          ))}
        </div>
        {!tasks.length && (
          <div className="panel empty">
            {technician ? "No tasks in this list" : "No issues in this list"}
          </div>
        )}
      </>
    );
  const reports = data.reports.filter((r: any) => r.incidentId === task.id);
  const files = reports.flatMap((r: any) => r.attachments || []);
  const work = (step: string, message = "") =>
    act({ action: "work", id: task.id, step, message });
  const active = ["Assigned", "Investigating", "Waiting Parts"].includes(
    task.status,
  );
  async function upload(
    e: React.ChangeEvent<HTMLInputElement>,
    purpose: string,
  ) {
    if (data.demo) {
      setUploadError("Switch to live data to upload evidence.");
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    setUploading(true);
    try {
      const f = new FormData();
      f.set("file", file);
      f.set("reportId", reports[0].id);
      f.set("purpose", purpose);
      await uploadEvidence(f, setUploadPercent);
      await refresh();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }
  return (
    <div className="service-task">
      <button className="secondary" onClick={() => setSelected("")}>
        <ArrowLeft size={18} />
        Back to {technician ? "tasks" : tab === "Team" ? "team" : "issues"}
      </button>
      <section className="panel service-task-main">
        <div className="service-card-top">
          <span className="status">{status(task.status)}</span>
          <span>{task.severity} priority</span>
        </div>
        <h2>{task.title}</h2>
        <ResponseDeadline issue={task} />
        {task.triage && <section className="triage-card">
          <h3>{data.demo ? "Demo triage example" : "AI incident triage"}</h3>
          <dl className="issue-facts">
            <div><dt>Category</dt><dd>{task.triage.category}</dd></div>
            <div><dt>Suggested priority</dt><dd>{task.triage.priority}</dd></div>
            <div><dt>Uncertainty</dt><dd>{task.triage.uncertainty}</dd></div>
            <div><dt>Reported location</dt><dd>{task.location}</dd></div>
            <div><dt>Department</dt><dd>{task.team}</dd></div>
            <div><dt>Suggested technician</dt><dd>{task.triage.suggestedTechnician || (task.owner === "Unassigned" ? "Awaiting department assignment" : who(task.owner))}</dd></div>
          </dl>
          <p>{task.triage.reason}</p>
          <ul>{task.triage.observations.map((text: string, index: number) => <li key={index}>{text}</li>)}</ul>
          {task.triage.missingDetails.length > 0 && <p>Details to confirm: {task.triage.missingDetails.join(" · ")}</p>}
          <p>{task.triage.averageResolutionMinutes == null ? "No comparable completed incidents in the current records." :
            task.triage.previousIncidents + " comparable incidents averaged " + task.triage.averageResolutionMinutes + " minutes to resolution."}</p>
        </section>}
        {["reviewer", "admin"].includes(data.user.role) && (
          <button
            className="secondary"
            style={{ color: "#ffad9c" }}
            disabled={busy}
            onClick={async () => {
              if (!window.confirm("Delete this issue for everyone? All linked reports, attachment access and notifications will be removed.")) return;
              const result = await act({ action: "delete", id: task.id });
              if (result) setSelected("");
            }}
          >
            Delete issue for everyone
          </button>
        )}
        {task.automation && (
          <section className="automation-summary">
            <strong>{task.automation.source} · {task.automation.state === "assigned" ? "Automatically assigned" : task.automation.state === "manual" ? "Staff assignment" : "Staff review needed"}</strong>
            <p>{task.automation.reason}</p>
          </section>
        )}
        {!technician && (
          <section className="staff-suggestion">
            <header>
              <h3>Review assistant</h3>
              <button
                className="secondary"
                disabled={aiBusy}
                onClick={() => assist("review")}
              >
                {aiBusy ? "Reviewing…" : "Suggest routing & duplicates"}
              </button>
            </header>
            {aiError && <p role="alert">{aiError}</p>}
            {task.recommendation && (
              <>
                <div className="suggestion-fields">
                  <span>{task.recommendation.department}</span>
                  <span>{task.recommendation.priority} priority</span>
                  <span>
                    {task.recommendation.uncertainty === "High"
                      ? "Needs more context"
                      : "Needs staff review"}
                  </span>
                </div>
                <p>{task.recommendation.reason}</p>
                <ul>
                  {task.recommendation.observations.map((o: string) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
                {task.recommendation.basedOn === task.updated &&
                !["Resolved", "Closed", "Verifying"].includes(task.status) ? (
                  <button
                    className="secondary"
                    onClick={(e) => {
                      const form = e.currentTarget
                        .closest(".service-task-main")!
                        .querySelector<HTMLFormElement>("[data-assignment]");
                      if (!form) return;
                      for (const [name, value] of Object.entries({
                        team: task.recommendation.department,
                        severity: task.recommendation.priority,
                        reason: (
                          "AI suggestion: " + task.recommendation.reason
                        ).slice(0, 300),
                      })) {
                        const input = form.elements.namedItem(
                          name,
                        ) as HTMLInputElement;
                        if (input) input.value = String(value);
                      }
                      form.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                    }}
                  >
                    Fill assignment fields
                  </button>
                ) : (
                  <p className="service-hint">
                    Suggestion is a draft. Recheck after the issue changes.
                  </p>
                )}
                {task.recommendation.duplicates.map((d: any) => (
                  <div key={d.id} className="duplicate-review">
                    <strong>
                      Possible duplicate:{" "}
                      {all.find((c: any) => c.id === d.id)?.title || d.id}
                    </strong>
                    <p>{d.reason}</p>
                    <button
                      className="secondary"
                      disabled={
                        busy || task.recommendation.basedOn !== task.updated
                      }
                      onClick={async () => {
                        const r = await act({
                          action: "merge",
                          id: task.id,
                          target: d.id,
                        });
                        if (r) setSelected(d.id);
                      }}
                    >
                      Merge into matching issue
                    </button>
                  </div>
                ))}
              </>
            )}
          </section>
        )}

        {!technician && (
          <section className="review-claim">
            <strong>
              {task.reviewer
                ? `Reviewer: ${who(task.reviewer)}`
                : "Department queue · Unclaimed"}
            </strong>
            {!task.reviewer ? (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => act({ action: "claim", id: task.id })}
              >
                Claim review
              </button>
            ) : task.reviewer === data.user.id ? (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => act({ action: "release", id: task.id })}
              >
                Release review
              </button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  act({
                    action: "claim",
                    id: task.id,
                    takeover: true,
                    reason: new FormData(e.currentTarget).get("reason"),
                  });
                }}
              >
                <label>
                  Takeover reason
                  <input
                    name="reason"
                    required
                    minLength={5}
                    maxLength={300}
                    placeholder="Covering for another reviewer"
                  />
                </label>
                <button className="secondary" disabled={busy}>
                  Take over review
                </button>
              </form>
            )}
          </section>
        )}

        <dl className="issue-facts">
          <div>
            <dt>Location</dt>
            <dd>{task.location}</dd>
          </div>
          <div>
            <dt>Department</dt>
            <dd>{task.team}</dd>
          </div>
          <div>
            <dt>Technician</dt>
            <dd>
              {task.owner === "Unassigned" ? "Not assigned" : who(task.owner)}
            </dd>
          </div>
          <div>
            <dt>Estimate</dt>
            <dd>{task.eta == null ? "Pending" : `${task.eta} minutes`}</dd>
          </div>
          <div>
            <dt>Reported</dt>
            <dd>{date(task.started)} MYT</dd>
          </div>
          <div>
            <dt>Last update</dt>
            <dd>{date(task.updated)} MYT</dd>
          </div>
        </dl>
        {reports.map((r: any) => (
          <section className="service-report" key={r.id}>
            {r.summary !== task.title && <h3>{r.summary}</h3>}
            <p>{r.detail}</p>
            {r.originalText && (
              <details>
                <summary>Original wording</summary>
                <p>{r.originalText}</p>
              </details>
            )}
            {!technician ? (
              <dl className="reporter-info">
                <div>
                  <dt>Student / User</dt>
                  <dd>{r.reporter?.name || "Name unavailable"}</dd>
                </div>
                <div>
                  <dt>TP number</dt>
                  <dd>{r.reporter?.tpNumber || "Not provided"}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{r.by}</dd>
                </div>
                <div>
                  <dt>Reported</dt>
                  <dd>{date(r.at)} MYT</dd>
                </div>
              </dl>
            ) : (
              <span>Reported by {r.reporter?.name || "Campus user"}</span>
            )}
            <EvidenceReviewPanel
              reportId={r.id}
              review={r.evidenceReview}
              hasMedia={(r.attachments || []).some((attachment: any) =>
                (!attachment.purpose || attachment.purpose === "attachment") &&
                /^(image|video)\//.test(attachment.type)
              )}
              refresh={refresh}
            />
          </section>
        ))}
        {!!files.length && (
          <section className="issue-section">
            <h3>Photos & attachments</h3>
            <div className="issue-evidence-grid">
              {files.map((a: any) => (
                <div className="issue-attachment" key={a.id}>
                  {a.type.startsWith("image/") && (
                    <img
                      src={"/api/evidence/" + a.id}
                      alt={a.name}
                      loading="lazy"
                    />
                  )}
                  {a.type.startsWith("video/") && (
                    <video
                      src={"/api/evidence/" + a.id}
                      controls
                      preload="metadata"
                    />
                  )}
                  <a
                    className="evidence-file"
                    href={"/api/evidence/" + a.id}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {a.purpose === "before"
                      ? "Before repair · "
                      : a.purpose === "after"
                        ? "After repair · "
                        : ""}
                    {a.name}
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}
        <RepairReviewPanel task={task} demo={data.demo} refresh={refresh} />
        {technician ? (
          <>
            {task.status === "Assigned" && (
              <button
                className="primary full service-action"
                disabled={busy}
                onClick={() => work("start")}
              >
                <Play size={20} />
                Start work
              </button>
            )}
            {active && task.status !== "Assigned" && (
              <>
                <div className="service-photo-actions">
                  {["before", "after"].map((p) => (
                    <label key={p} className="secondary service-action">
                      <Camera size={20} />
                      {p === "before" ? "Before photo" : "After photo"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        capture="environment"
                        disabled={uploading}
                        onChange={(e) => upload(e, p)}
                      />
                    </label>
                  ))}
                </div>
                <label className="secondary service-video">
                  <Upload size={18} />
                  Repair video
                  <input
                    type="file"
                    accept="video/mp4,video/webm"
                    disabled={uploading}
                    onChange={(e) => upload(e, "after")}
                  />
                </label>
                {uploading && <div role="status">Uploading evidence · {uploadPercent}%<progress aria-label="Evidence upload" max={100} value={uploadPercent} />{uploadPercent === 100 && <p>Upload sent. Saving evidence…</p>}</div>}
                {uploadError && <p role="alert">{uploadError}</p>}
                <form
                  className="service-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    await work("complete", String(f.get("note") || ""));
                  }}
                >
                  <label>
                    Repair note
                    <textarea
                      name="note"
                      maxLength={1200}
                      rows={2}
                      value={repairNote}
                      onChange={(e) => setRepairNote(e.target.value)}
                      placeholder="What did you fix?"
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    disabled={aiBusy || repairNote.trim().length < 5}
                    onClick={() => assist("draft")}
                  >
                    {aiBusy ? "Drafting…" : "Polish update"}
                  </button>
                  {aiError && <p role="alert">{aiError}</p>}
                  {draft && (
                    <div className="smart-result">
                      <p>{draft}</p>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setRepairNote(draft);
                          setDraft("");
                        }}
                      >
                        Use draft
                      </button>
                    </div>
                  )}
                  <button
                    className="primary full service-action"
                    disabled={
                      busy ||
                      uploading ||
                      (repairNote.trim().length < 10 &&
                        !files.some(
                          (a: any) =>
                            (a.purpose === "after" ||
                              a.type.startsWith("video/")) &&
                            a.at >= (task.workStartedAt || task.updated),
                        ))
                    }
                  >
                    <Check size={20} />
                    Submit completion
                  </button>
                  <p className="service-hint">
                    Add a photo, repair video, or a completion note of at least
                    10 characters. Staff approval is required.
                  </p>
                </form>
                <details className="service-options">
                  <summary>Update or request help</summary>
                  <form
                    className="service-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const f = new FormData(form);
                      const result = await work(
                        String(f.get("step")),
                        String(f.get("message") || ""),
                      );
                      if (result) form.reset();
                    }}
                  >
                    <label>
                      Action
                      <select name="step">
                        <option value="update">Add update</option>
                        <option value="waiting">Waiting for parts</option>
                        <option value="help">Request help</option>
                      </select>
                    </label>
                    <label>
                      Note
                      <textarea name="message" maxLength={1200} rows={2} />
                    </label>
                    <button className="secondary" disabled={busy}>
                      Send update
                    </button>
                  </form>
                </details>
              </>
            )}
            {task.status === "Verifying" && (
              <p className="service-next">
                Completion sent. Department staff will review your repair.
              </p>
            )}
            {["Resolved", "Closed"].includes(task.status) && (
              <p className="service-next">
                Repair approved
                {task.status === "Closed"
                  ? " and confirmed by the reporter"
                  : ". Waiting for reporter confirmation"}
                .
              </p>
            )}
          </>
        ) : (
          <>
            {task.status === "Verifying" ? (
              <section className="service-approval">
                <h3>Verify repair</h3>
                <p>Review the photos and technician update above.</p>
                <label>
                  Review note
                  <textarea
                    maxLength={300}
                    value={repairNote}
                    onChange={(e) => setRepairNote(e.target.value)}
                    placeholder="Add a check or explain what still needs work"
                  />
                </label>
                <div className="service-photo-actions">
                  <button
                    className="primary service-action"
                    disabled={busy}
                    onClick={() =>
                      act({
                        action: "review",
                        id: task.id,
                        approve: true,
                        message: repairNote,
                      })
                    }
                  >
                    Approve repair
                  </button>
                  <button
                    className="secondary service-action"
                    disabled={busy}
                    onClick={() =>
                      act({
                        action: "review",
                        id: task.id,
                        approve: false,
                        message: repairNote,
                      })
                    }
                  >
                    Return for work
                  </button>
                </div>
              </section>
            ) : (
              !["Resolved", "Closed"].includes(task.status) && (
                <form
                  className="service-form"
                  data-assignment="true"
                  key={task.id + task.updated}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    act({
                      action: "assign",
                      id: task.id,
                      team: f.get("team"),
                      owner: f.get("owner"),
                      severity: f.get("severity"),
                      reason: f.get("reason"),
                      eta: f.get("eta") === "" ? null : Number(f.get("eta")),
                    });
                  }}
                >
                  <h3>Assign or transfer</h3>
                  {task.routingHint && task.routingHint !== task.team && (
                    <p className="overdue-note">
                      The report wording may fit {task.routingHint}. Check
                      before assigning.
                    </p>
                  )}
                  <label>
                    Department
                    <select name="team" defaultValue={task.team}>
                      {data.teams.map((t: string) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Technician
                    <select name="owner" defaultValue={task.owner}>
                      <option value="Unassigned">Not assigned</option>
                      {data.directory
                        .filter((a: any) => a.role === "operator")
                        .map((a: any) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Priority
                    <select name="severity" defaultValue={task.severity}>
                      {["Critical", "High", "Medium", "Low"].map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                  {task.priorityReason && (
                    <p className="service-hint">
                      Rule suggestion: {task.priorityReason}. Staff can change
                      it.
                    </p>
                  )}
                  <label>
                    Transfer reason
                    <input
                      name="reason"
                      maxLength={300}
                      placeholder="Required when changing departments"
                    />
                  </label>
                  <label>
                    Estimated minutes
                    <input
                      type="number"
                      name="eta"
                      min={0}
                      max={10080}
                      defaultValue={task.eta ?? ""}
                    />
                  </label>
                  <button className="primary service-action" disabled={busy}>
                    Save assignment
                  </button>
                </form>
              )
            )}
            {!["Resolved", "Closed", "Verifying"].includes(task.status) && (
              <details className="service-options">
                <summary>Merge duplicate</summary>
                <form
                  className="service-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const result = await act({
                      action: "merge",
                      id: task.id,
                      target: new FormData(e.currentTarget).get("target"),
                    });
                    if (result) setSelected("");
                  }}
                >
                  <label>
                    Link to an existing issue
                    <select name="target" required>
                      <option value="">Choose an issue</option>
                      {all
                        .filter(
                          (c: any) =>
                            c.id !== task.id &&
                            !["Resolved", "Closed"].includes(c.status),
                        )
                        .map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.title} · {c.location}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button className="secondary" disabled={busy}>
                    Merge reports
                  </button>
                </form>
              </details>
            )}
          </>
        )}
        {!technician && (
          <details className="service-options">
            <summary>Change priority</summary>
            <form
              className="service-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                act({
                  action: "priority",
                  id: task.id,
                  severity: f.get("severity"),
                  message: f.get("message"),
                });
              }}
            >
              <label>
                Priority
                <select name="severity" defaultValue={task.severity}>
                  {["Critical", "High", "Medium", "Low"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                Reason
                <input name="message" required minLength={5} maxLength={300} />
              </label>
              <button className="secondary" disabled={busy}>
                Update priority
              </button>
            </form>
          </details>
        )}
        <IssueTimeline issue={task} attachments={files} />
      </section>
    </div>
  );
}
