"use client";
export default function IssueTimeline({ issue, attachments = [] }: { issue: any; attachments?: any[] }) {
  const events = [
    { id: "submitted", at: issue.started ?? issue.at, text: "Issue reported", actor: "Reporter" },
    ...(issue.updates || []).map((event: any) => ({ ...event, actor: event.actor || "Issue update" })),
    ...attachments.map((file: any) => ({ id: "file-" + file.id, at: file.at,
      text: `${file.purpose === "before" ? "Before repair" : file.purpose === "after" ? "After repair" : "Report"} evidence: ${file.name}`, actor: "Evidence uploaded", file: file.id })),
  ].filter(event => Number.isFinite(event.at)).sort((a, b) => a.at - b.at);
  return <section className="issue-timeline"><h3>Issue timeline</h3>
    <p>Current status: <strong>{issue.confirmed || issue.status === "Closed" ? "Confirmed by reporter" : issue.status === "Verifying" ? "Awaiting staff approval" : issue.status}</strong></p>
    <ol>{events.map((event: any) => <li key={event.id}><span className="timeline-dot" /><div>
      <strong>{event.text}</strong><small>{event.actor} · <time dateTime={new Date(event.at).toISOString()}>{new Date(event.at).toLocaleString("en-GB", {timeZone: "Asia/Kuala_Lumpur"})} MYT</time></small>
      {event.file && <a href={"/api/evidence/" + event.file} target="_blank" rel="noreferrer">View evidence</a>}
    </div></li>)}</ol>
  </section>;
}
