"use client";
import { useState } from "react";
const steps = [
  { role: "Student", title: "Report a leaking tap", action: "Submit sample report", text: "A student reports: ‘The bathroom tap keeps dripping in APU On-Campus Residence J1.’" },
  { role: "Intake preview", title: "Review triage and assign", action: "Assign Daniel Wong", text: "Sample analysis: Water / Plumbing · Medium priority · Maintenance. Daniel Wong belongs to Maintenance. This is a scripted suggestion, with no live AI call or confidence score." },
  { role: "Technician", title: "Accept and begin work", action: "Start sample repair", text: "Daniel acknowledges the assignment and starts work. The response timer stops. A live assignment prompts staff after 24 hours without a response, with a reassignment check after 48 hours." },
  { role: "Technician", title: "Submit before / after evidence", action: "Submit repair for review", text: "Sample repair note: ‘Replaced the worn washer and checked the tap.’ The illustrations below show the intended evidence flow; they are not uploaded photographs or AI findings." },
  { role: "Department staff", title: "Approve the repair", action: "Approve sample repair", text: "Staff inspect the repair note and both evidence items. In this free demonstration, a scripted review replaces live AI. Approval remains a staff decision." },
  { role: "Student", title: "Confirm the outcome", action: "Confirm sample resolution", text: "The student checks the tap and confirms that it has stopped dripping. A live student can reopen the issue if the fault returns." },
];
export default function DemoJourney() {
  const [step, setStep] = useState(0), [open, setOpen] = useState(false);
  const complete = step === steps.length;
  const current = steps[Math.min(step, steps.length - 1)];
  return <section className="demo-journey panel">
    <header><div><h2>Three-minute guided demo</h2><p>Scripted sample · No AI credits · No saved reports changed</p></div><button className="secondary" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide walkthrough" : "Start walkthrough"}</button></header>
    {open && <><ol className="demo-step-list" aria-label="Demo progress">{steps.map((item, index) => <li key={item.title} aria-current={step === index ? "step" : undefined} className={index < step ? "done" : ""}>{index + 1}. {item.role}</li>)}</ol>
      <div className="demo-scene" aria-live="polite"><span className="badge">{complete ? "Demo complete" : `Step ${step + 1} of 6 · ${current.role}`}</span>
        <h3>{complete ? "Reported → assigned → repaired → approved → confirmed" : current.title}</h3>
        <p>{complete ? "The sample issue is confirmed. No live issue, assignment, evidence or notification was created." : current.text}</p>
        {step >= 3 && <div className="demo-evidence">{["Before", "After"].map((label, index) => <figure key={label}><svg viewBox="0 0 240 120" role="img" aria-label={label + " illustrative tap"}><path d="M35 40h85v25h50v15H95V55H35z" fill="#8495a3"/><path d="M115 40V25h40" fill="none" stroke="#8495a3" strokeWidth="10"/>{index === 0 ? <path d="M165 88q-10 14 0 18q10-4 0-18" fill="#56cce2"/> : <path d="m155 98 10 10 20-25" fill="none" stroke="#74dbb0" strokeWidth="6"/>}</svg><figcaption>{label} · Illustration</figcaption></figure>)}</div>}
        <div className="demo-actions">{!complete && <button className="primary" onClick={() => setStep(value => Math.min(steps.length, value + 1))}>{current.action}</button>}{step > 0 && <button className="secondary" onClick={() => setStep(value => value - 1)}>Previous step</button>}<button className="secondary" onClick={() => setStep(0)}>Restart demo</button></div>
      </div></>}
  </section>;
}
