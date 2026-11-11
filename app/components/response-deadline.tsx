"use client";
import { useEffect, useState } from "react";
import { responseDeadline } from "../../lib/response-deadline";
export default function ResponseDeadline({ issue, compact = false }: { issue: any; compact?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const deadline = responseDeadline(issue, now);
  if (!deadline) return null;
  return <div className={"response-deadline " + (deadline.overdue ? "late" : deadline.soon ? "soon" : "") }>
    <strong>{deadline.label}</strong>
    {!compact && <><p>Start work to acknowledge this assignment. Response due {new Date(deadline.due).toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur" })} MYT.</p>
      <p>Staff reminder after 24 hours without a response; reassignment check after 48 hours. These are response deadlines, separate from the repair estimate.</p></>}
  </div>;
}
