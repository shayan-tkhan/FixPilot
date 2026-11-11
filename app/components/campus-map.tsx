"use client";
import { useState } from "react";
import { campusSites, campusSources, siteForLocation } from "../../lib/campus";
export default function CampusMap({ data, onOpen }: { data: any; onOpen: (id: string) => void }) {
  const [selected, setSelected] = useState(campusSites[0].id);
  const site = campusSites.find(item => item.id === selected)!;
  const cases = data.cases || [];
  const active = cases.filter((item: any) => !["Resolved", "Closed"].includes(item.status));
  const selectedCases = active.filter((item: any) => siteForLocation(item.location)?.id === site.id);
  const unmapped = active.filter((item: any) => !siteForLocation(item.location));
  return <section className="campus-map">
    <header><h2>{data.user.role === "operator" ? "Your assigned areas" : "APU campus and residences"}</h2>
      <p>Green · no active issues in this view. Orange · active issue. Red · critical issue. Technicians see their assigned tasks.</p></header>
    <div className="campus-map-layout"><div className="campus-sites">{campusSites.map(item => {
      const issues = active.filter((issue: any) => siteForLocation(issue.location)?.id === item.id);
      const critical = issues.some((issue: any) => issue.severity === "Critical");
      return <button key={item.id} className={"site-card " + (critical ? "site-critical" : issues.length ? "site-active" : "site-normal")}
        aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}><strong>{item.name}</strong><span>{issues.length} active · {critical ? "Critical" : issues.length ? "Attention needed" : "No active reports"}</span></button>;
    })}</div>
      <section className="panel map-detail"><h3>{site.name}</h3>
        <iframe title={"Map of " + site.name} src={"https://maps.google.com/maps?q=" + encodeURIComponent(site.query) + "&output=embed"} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        <a href={"https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(site.query)} target="_blank" rel="noreferrer">Open map and directions</a>
        <p>Map search for the named site. Confirm the building, room and entrance before dispatch.</p>
        <h3>{data.user.role === "operator" ? "Your tasks here" : "Active issues here"}</h3>
        {selectedCases.map((item: any) => <button className="map-task" key={item.id} onClick={() => onOpen(item.id)}><strong>{item.title}</strong><span>{item.location} · {item.severity} · {item.status}</span></button>)}
        {!selectedCases.length && <p>No active issues in this view.</p>}
      </section></div>
    {unmapped.length > 0 && <section className="panel"><h3>Location confirmation needed ({unmapped.length})</h3>
      {unmapped.map((item: any) => <button className="map-task" key={item.id} onClick={() => onOpen(item.id)}>{item.title} · {item.location}</button>)}</section>}
    <p className="service-hint">Residence directory checked against APU's published information.
      <a href={campusSources.guide} target="_blank" rel="noreferrer"> APU campus guide</a> · <a href={campusSources.residences} target="_blank" rel="noreferrer">APU residence directory</a></p>
  </section>;
}
