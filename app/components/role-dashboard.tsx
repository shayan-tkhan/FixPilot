"use client";
import MonthlyDashboard from "./monthly-dashboard";
import DemoJourney from "./demo-journey";
import {
  Activity,
  ArrowRight,
  Bell,
  CheckCircle2,
  ClipboardList,
  Clock3,
  MapPin,
  Plus,
  Users,
  Wrench,
} from "lucide-react";
const today = (n: number) =>
  new Date(n).toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
const stamp = (n: number) =>
  new Date(n).toLocaleString("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const label = (s: string) =>
  ({
    "Needs triage": "Pending review",
    Investigating: "In progress",
    Verifying: "Staff review",
    Closed: "Confirmed",
  })[s] || s;
export default function RoleDashboard({
  data,
  onNavigate,
  onOpen,
  onCreate,
}: {
  data: any;
  onNavigate: (tab: string, filter?: string) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const student = data.user.role === "reporter",
    tech = data.user.role === "operator",
    admin = data.user.role === "admin";
  const items: any[] = student ? data.issues : data.cases;
  const count = (statuses: string[]) =>
    items.filter((i) => statuses.includes(i.status)).length;
  const target = student ? "My Issues" : tech ? "My Tasks" : "Issues";
  const metrics = student
    ? [
        {
          label: "Active issues",
          value: items.filter((i) => !["Resolved", "Closed"].includes(i.status))
            .length,
          filter: "Open",
          color: "blue",
          icon: ClipboardList,
        },
        {
          label: "Pending review",
          value: count(["Needs triage"]),
          filter: "Needs triage",
          color: "amber",
          icon: Clock3,
        },
        {
          label: "In progress",
          value: count(["Investigating", "Waiting Parts"]),
          filter: "Working",
          color: "purple",
          icon: Wrench,
        },
        {
          label: "Confirm resolution",
          value: items.filter((i) => i.status === "Resolved" && !i.confirmed)
            .length,
          filter: "Resolved",
          color: "green",
          icon: CheckCircle2,
        },
      ]
    : tech
      ? [
          {
            label: "Assigned to you",
            value: count(["Assigned"]),
            filter: "Assigned",
            color: "blue",
            icon: ClipboardList,
          },
          {
            label: "In progress",
            value: count(["Investigating"]),
            filter: "Investigating",
            color: "purple",
            icon: Wrench,
          },
          {
            label: "Waiting for parts",
            value: count(["Waiting Parts"]),
            filter: "Waiting Parts",
            color: "amber",
            icon: Clock3,
          },
          {
            label: "Completed today",
            value: items.filter((i) =>
              i.updates.some(
                (u: any) =>
                  u.text.startsWith("Repair submitted for staff review.") &&
                  today(u.at) === today(Date.now()),
              ),
            ).length,
            filter: "TodayCompleted",
            color: "green",
            icon: CheckCircle2,
          },
        ]
      : admin
        ? [
            {
              label: "Open issues",
              value: items.filter(
                (i) => !["Resolved", "Closed"].includes(i.status),
              ).length,
              filter: "Open",
              color: "blue",
              icon: ClipboardList,
            },
            {
              label: "Urgent issues",
              value: items.filter(
                (i) =>
                  ["High", "Critical"].includes(i.severity) &&
                  !["Resolved", "Closed"].includes(i.status),
              ).length,
              filter: "Urgent",
              color: "red",
              icon: Activity,
            },
            {
              label: "Awaiting approval",
              value: count(["Verifying"]),
              filter: "Verifying",
              color: "amber",
              icon: Clock3,
            },
            {
              label: "Resolved today",
              value: items.filter(
                (i) =>
                  i.resolvedAt && today(i.resolvedAt) === today(Date.now()),
              ).length,
              filter: "TodayResolved",
              color: "green",
              icon: CheckCircle2,
            },
          ]
        : [
            {
              label: "New issues",
              value: count(["Needs triage"]),
              filter: "Needs triage",
              color: "blue",
              icon: ClipboardList,
            },
            {
              label: "Assigned",
              value: count(["Assigned"]),
              filter: "Assigned",
              color: "purple",
              icon: Users,
            },
            {
              label: "In progress",
              value: count(["Investigating", "Waiting Parts"]),
              filter: "Working",
              color: "amber",
              icon: Wrench,
            },
            {
              label: "Awaiting approval",
              value: count(["Verifying"]),
              filter: "Verifying",
              color: "green",
              icon: CheckCircle2,
            },
          ];
  const quick = student
    ? [
        { label: "Report issue", icon: Plus, run: onCreate },
        {
          label: "Track issues",
          icon: ClipboardList,
          run: () => onNavigate("My Issues"),
        },
        {
          label: "Notifications",
          icon: Bell,
          run: () => onNavigate("Notifications"),
        },
      ]
    : tech
      ? [
          {
            label: "Start a task",
            icon: Wrench,
            run: () => onNavigate("My Tasks", "Assigned"),
          },
          {
            label: "Urgent tasks",
            icon: Activity,
            run: () => onNavigate("My Tasks", "Urgent"),
          },
          {
            label: "Notifications",
            icon: Bell,
            run: () => onNavigate("Notifications"),
          },
        ]
      : [
          {
            label: "Assign technician",
            icon: Users,
            run: () => onNavigate("Issues", "Needs triage"),
          },
          {
            label: "Verify repairs",
            icon: CheckCircle2,
            run: () => onNavigate("Issues", "Verifying"),
          },
          { label: "View teams", icon: Wrench, run: () => onNavigate("Team") },
        ];
  const attention = items
    .filter(
      (i) => !["Closed", ...(student ? [] : ["Resolved"])].includes(i.status),
    )
    .slice()
    .sort((a, b) => {
      const rank = (i: any) =>
        student
          ? i.status === "Resolved"
            ? 0
            : 1
          : tech
            ? i.status === "Assigned"
              ? 0
              : 1
            : i.status === "Verifying"
              ? 0
              : i.status === "Needs triage"
                ? 1
                : 2;
      return rank(a) - rank(b) || (b.updated || b.at) - (a.updated || a.at);
    })
    .slice(0, 5);
  const activity = items
    .flatMap((i) =>
      i.updates
        .filter((u: any) => !u.actor?.startsWith("FixPilot"))
        .map((u: any) => ({ ...u, item: i.id, title: i.summary || i.title })),
    )
    .sort((a, b) => b.at - a.at)
    .slice(0, 5);
  const statuses = student
    ? [
        ["Reported", ["Needs triage"]],
        ["Assigned", ["Assigned"]],
        ["In progress", ["Investigating", "Waiting Parts"]],
        ["Staff review", ["Verifying"]],
        ["Resolved", ["Resolved", "Closed"]],
      ]
    : tech
      ? [
          ["Assigned", ["Assigned"]],
          ["In progress", ["Investigating"]],
          ["Waiting parts", ["Waiting Parts"]],
          ["Staff review", ["Verifying"]],
          ["Approved", ["Resolved", "Closed"]],
        ]
      : null;
  return (
    <div className="role-dashboard">
      {!student && items.some(i=>i.overdue) && <button className="dashboard-overdue" onClick={()=>onNavigate(tech?"My Tasks":"Issues","Overdue")}><Clock3 size={19}/><strong>{items.filter(i=>i.overdue).length} overdue tasks</strong><span>No technician response · Review assignments</span><ArrowRight size={18}/></button>}
      <div className="dashboard-context">
        <span>
          {student
            ? "Your issues"
            : tech
              ? "Your workday"
              : admin
                ? "Campus overview"
                : "Department overview"}
        </span>
        <span className="dashboard-live">
          <i />
          {data.demo ? "Presentation data" : "Live updates"}
        </span>
      </div>
      <div className="dashboard-metrics">
        {metrics.map((m) => (
          <button
            key={m.label}
            className={"dashboard-metric " + m.color}
            onClick={() => onNavigate(target, m.filter)}
          >
            <div>
              <span>{m.label}</span>
              <m.icon size={18} />
            </div>
            <strong>{String(m.value).padStart(2, "0")}</strong>
            <ArrowRight size={18} className="metric-arrow" />
          </button>
        ))}
      </div>
      <div className="dashboard-columns">
        <section className="panel dashboard-section">
          <header>
            <h2>Quick access</h2>
          </header>
          <div className="dashboard-quick">
            {quick.map((q) => (
              <button key={q.label} onClick={q.run}>
                <q.icon size={24} />
                <span>{q.label}</span>
                <ArrowRight size={17} />
              </button>
            ))}
          </div>
        </section>
        <section className="panel dashboard-section">
          <header>
            <h2>
              {student
                ? "Your progress"
                : tech
                  ? "Task progress"
                  : "Department workload"}
            </h2>
            {!student && !tech && (
              <button onClick={() => onNavigate("Team")}>
                View teams <ArrowRight size={14} />
              </button>
            )}
          </header>
          <div className="dashboard-workload">
            {statuses
              ? statuses.map(([name, states]) => (
                  <div key={String(name)}>
                    <span>{name}</span>
                    <div className="workload-track">
                      <i
                        style={{
                          width: `${items.length ? (count(states as string[]) / items.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <strong>{count(states as string[])}</strong>
                  </div>
                ))
              : (data.teams || [])
                  .map((team: string) => ({
                    team,
                    total: items.filter(
                      (i) =>
                        i.team === team &&
                        !["Resolved", "Closed"].includes(i.status),
                    ).length,
                  }))
                  .filter((t: any) => t.total > 0)
                  .sort((a: any, b: any) => b.total - a.total)
                  .slice(0, 5)
                  .map((t: any) => (
                    <div key={t.team}>
                      <span>{t.team}</span>
                      <div className="workload-track">
                        <i
                          style={{
                            width: `${items.length ? (t.total / items.length) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <strong>{t.total}</strong>
                    </div>
                  ))}
            {!statuses &&
              !items.some(
                (i) => !["Resolved", "Closed"].includes(i.status),
              ) && <p className="dashboard-empty">No open issues</p>}
          </div>
        </section>
        <section className="panel dashboard-section">
          <header>
            <h2>
              {student ? "My issues" : tech ? "My tasks" : "Needs attention"}
            </h2>
            <button onClick={() => onNavigate(target)}>
              View all <ArrowRight size={14} />
            </button>
          </header>
          <div className="dashboard-queue">
            {attention.map((i) => (
              <button key={i.id} onClick={() => onOpen(i.id)}>
                <div>
                  <strong>{i.summary || i.title}</strong>
                  <span>
                    <MapPin size={13} />
                    {i.location}
                  </span>
                </div>
                <span className="status" data-stage={i.status}>
                  {i.confirmed ? "Confirmed" : label(i.status)}
                </span>
                <ArrowRight size={16} />
              </button>
            ))}
            {!attention.length && (
              <p className="dashboard-empty">
                {student
                  ? "No issues to track. Report an issue when you need help."
                  : tech
                    ? "No tasks need your attention."
                    : "You're up to date. No issues need attention."}
              </p>
            )}
          </div>
        </section>
        <section className="panel dashboard-section">
          <header>
            <h2>Recent activity</h2>
          </header>
          <div className="dashboard-activity">
            {activity.map((u) => (
              <button key={u.item + u.id} onClick={() => onOpen(u.item)}>
                <span className="dashboard-activity-dot" />
                <div>
                  <strong>{u.title}</strong>
                  <p>{u.text}</p>
                  <time>{stamp(u.at)} MYT</time>
                </div>
              </button>
            ))}
            {!activity.length && (
              <p className="dashboard-empty">
                Updates will appear here as work progresses.
              </p>
            )}
          </div>
        </section>
      </div>
      <DemoJourney />
      <MonthlyDashboard data={data} />
    </div>
  );
}
