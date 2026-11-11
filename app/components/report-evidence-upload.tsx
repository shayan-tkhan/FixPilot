"use client";
import { useState } from "react";
import { uploadEvidence } from "../../lib/upload-evidence";
export default function ReportEvidenceUpload({ reportId, demo, refresh }: { reportId: string; demo: boolean; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [percent, setPercent] = useState(0), [error, setError] = useState("");
  return <section className="report-evidence-upload"><label className="secondary service-action">{busy ? "Uploading evidence…" : "Add report photo or video"}
    <input type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" disabled={busy || demo}
      onChange={async event => {
        const input = event.currentTarget, file = input.files?.[0];
        if (!file || demo) return;
        setBusy(true); setError("");
        try { const form = new FormData(); form.set("reportId", reportId); form.set("file", file);
          await uploadEvidence(form, setPercent); await refresh();
        } catch (failure) { setError(failure instanceof Error ? failure.message : "Upload failed. Try again."); }
        finally { input.value = ""; setBusy(false); }
      }} /></label>
    {busy && <div role="status">{percent}%{percent === 100 ? " · Saving evidence…" : " · Uploading…"}<progress aria-label="Additional evidence upload" max={100} value={percent}/></div>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
