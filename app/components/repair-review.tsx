"use client";
import { useState } from "react";
const labels: Record<string, string> = {
  consistent: "Visible changes support the repair note",
  possible_mismatch: "Repair evidence needs staff review",
  unclear: "Repair cannot be confirmed visually",
  unavailable: "AI comparison unavailable",
};
export default function RepairReviewPanel({ task, demo, refresh }: { task: any; demo?: boolean; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const review = task.repairReview;
  async function compare() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/repair-review", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: task.id }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not compare repair evidence."); }
    finally { setBusy(false); }
  }
  return <section className="evidence-review-panel">
    <h3>Before / after repair comparison</h3>
    <p>Compare the assigned technician's before and after evidence with their completion note.</p>
    {review && <div className={"evidence-result evidence-" + review.status}>
      <strong>{labels[review.status]}</strong>
      <ul>{review.observations.map((text: string, index: number) => <li key={index}>{text}</li>)}</ul>
      {review.limitations.map((text: string, index: number) => <p key={index}>{text}</p>)}
    </div>}
    {error && <p role="alert">{error}</p>}
    <button type="button" className="secondary" disabled={busy || demo} onClick={compare}>{busy ? "Comparing before and after…" : "Compare before / after evidence"}</button>
    <p className="service-hint">Department staff approve the repair. The reporter confirms the outcome.</p>
  </section>;
}
