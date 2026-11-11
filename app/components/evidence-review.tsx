"use client";
import { useState } from "react";
import type { EvidenceReview } from "../../lib/ai/evidence";

const labels = {
  consistent: "Evidence appears consistent",
  possible_mismatch: "Possible description mismatch",
  unclear: "More context needed",
  unavailable: "AI check unavailable",
};

export default function EvidenceReviewPanel({
  reportId,
  review,
  hasMedia,
  refresh,
}: {
  reportId: string;
  review?: EvidenceReview;
  hasMedia: boolean;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function compare() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/evidence-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Could not compare the evidence.");
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not compare the evidence.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="evidence-review-panel" aria-label="Description and evidence check">
      <h3>Description and evidence check</h3>
      {review ? (
        <div className={"evidence-result evidence-" + review.status}>
          <strong>{labels[review.status]}</strong>
          <p>{review.analyzedAttachmentIds.length} attachment(s) checked</p>
          <ul>
            {review.observations.map((observation, index) => (
              <li key={index}>{observation}</li>
            ))}
          </ul>
          {review.limitations.map((limitation, index) => (
            <p className="service-hint" key={index}>{limitation}</p>
          ))}
          <time dateTime={new Date(review.at).toISOString()}>
            Checked {new Date(review.at).toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur" })} MYT
          </time>
        </div>
      ) : (
        <p>{hasMedia
          ? "Evidence is awaiting comparison with this report's description."
          : "Add a photo or video of the reported problem for an evidence comparison."}</p>
      )}
      {error && <p role="alert">{error}</p>}
      <button type="button" className="secondary" onClick={compare} disabled={busy || !hasMedia}>
        {busy ? "Comparing evidence…" : review ? "Check evidence again" : "Compare description and evidence"}
      </button>
      <p className="service-hint">
        Staff review is required. A visual match cannot establish when or where
        media was captured, whether it was edited, or whether a hidden fault is fixed.
      </p>
    </section>
  );
}
