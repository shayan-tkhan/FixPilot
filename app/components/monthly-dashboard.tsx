"use client";
import { useState } from "react";
import { monthKey, periodStats } from "../../lib/campus";
export default function MonthlyDashboard({ data }: { data: any }) {
  const [month, setMonth] = useState("all");
  const items = data.user.role === "reporter" ? data.issues : data.cases;
  const months = [...new Set<string>(items.map((item: any) => monthKey(item.started ?? item.at)))].sort().reverse();
  const stats = periodStats(items, month);
  return <section className="monthly-dashboard panel">
    <header><div><h2>Monthly overview</h2><p>Current status of issues submitted in the selected period.</p></div>
      <label>Reporting period<select aria-label="Reporting period" value={month} onChange={event => setMonth(event.target.value)}>
        <option value="all">All months</option>{months.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
    </header>
    <div className="monthly-metrics">{Object.entries(stats).map(([name, value]) => <article key={name}><span>{name}</span><strong>{value}</strong></article>)}</div>
    <details><summary>Monthly breakdown</summary><div className="monthly-table"><table><thead><tr><th>Month</th><th>Total</th><th>Active</th><th>Resolved</th><th>Confirmed</th><th>Critical</th></tr></thead>
      <tbody>{months.map(value => { const row = periodStats(items, value); return <tr key={value}><th>{value}</th><td>{row.total}</td><td>{row.active}</td><td>{row.resolved}</td><td>{row.confirmed}</td><td>{row.critical}</td></tr>; })}</tbody></table></div></details>
  </section>;
}
