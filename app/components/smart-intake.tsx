"use client";
import { useRef, useState } from "react";
import { Camera, Sparkles } from "lucide-react";
export default function SmartIntake({
  onApplied,
}: {
  onApplied: (id: string) => void;
}) {
  const generation = useRef(0);
  const [result, setResult] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function suggest(button: HTMLElement, fillEmpty = false) {
    const current = ++generation.current;
    const form = button.closest("form")!;
    const f = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const upload = new FormData();
      upload.set("intent", "intake");
      upload.set(
        "text",
        [f.get("summary"), f.get("detail")].filter(Boolean).join("\n"),
      );
      upload.set("location", String(f.get("location") || ""));
      const image = f
        .getAll("files")
        .find(
          (x) => x instanceof File && x.size && x.type.startsWith("image/"),
        );
      if (image) upload.set("image", image);
      const r = await fetch("/api/assist", { method: "POST", body: upload });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (current !== generation.current) return;
      setResult(d);
      if (fillEmpty) {
        for (const [name, value] of Object.entries({
          summary: d.suggestion.summary, detail: d.suggestion.description,
          category: d.suggestion.category, ...(d.suggestion.location ? { location: d.suggestion.location } : {}),
        })) {
          const input = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
          if (input && (!input.value || (name === "category" && input.value === "Other"))) input.value = String(value);
        }
        const values = new FormData(form);
        if (values.get("summary") === d.suggestion.summary && values.get("detail") === d.suggestion.description && values.get("category") === d.suggestion.category)
          onApplied(d.id);
      }
    } catch (e) {
      if (current === generation.current) setError(e instanceof Error ? e.message : "Could not suggest details");
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  function apply(button: HTMLButtonElement) {
    const form = button.closest("form")!,
      s = result.suggestion;
    for (const [name, value] of Object.entries({
      summary: s.summary,
      detail: s.description,
      category: s.category,
      ...(s.location ? { location: s.location } : {}),
    })) {
      const input = form.elements.namedItem(name) as
        | HTMLInputElement
        | HTMLSelectElement
        | HTMLTextAreaElement;
      if (input) input.value = String(value);
    }
    onApplied(result.id);
    setResult({ ...result, applied: true });
  }
  return (
    <section className="smart-intake">
      <header>
        <strong>
          <Sparkles size={17} />
          Smart fill
        </strong>
        <span>Photo or text preview</span>
      </header>
      <label className="smart-photo">
        <Camera size={22} />
        <span>Take or choose a photo</span>
        <input
          type="file"
          name="files"
          accept="image/png,image/jpeg,image/webp"
          capture="environment"
          onChange={(event) => {
            setResult(null);
            if (event.currentTarget.files?.[0]) void suggest(event.currentTarget, true);
            else { generation.current++; setBusy(false); }
          }}
        />
      </label>
      <button
        type="button"
        className="secondary full"
        disabled={busy}
        onClick={(e) => suggest(e.currentTarget)}
      >
        {busy ? "Preparing suggestions…" : "Preview AI suggestions"}
      </button>
      {error && <p role="alert">{error}</p>}
      <p className="service-hint">
        Submitting detects the issue category and routes clear reports to the
        department's available technician. Uncertain reports go to staff review.
      </p>
      {result && (
        <div className="smart-result">
          <strong>{result.suggestion.summary}</strong>
          <p>{result.suggestion.description}</p>
          <div>
            <span>{result.suggestion.category}</span>
            <span>{result.suggestion.priority} priority</span>
          </div>
          <p>{result.suggestion.reason}</p>
          {result.suggestion.uncertainty === "High" && (
            <p className="overdue-note">
              More context is needed. Check the suggestion before submitting.
            </p>
          )}
          {result.suggestion.missingDetails.length > 0 && (
            <ul>
              {result.suggestion.missingDetails.map((q: string) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="primary full"
            onClick={(e) => apply(e.currentTarget)}
          >
            {result.applied ? "Apply again" : "Use these details"}
          </button>
          <p className="service-hint">
            AI suggestion · Check the fields and add the location before
            submitting.
          </p>
        </div>
      )}
    </section>
  );
}
