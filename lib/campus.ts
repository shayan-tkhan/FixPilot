export const campusSources = {
  guide: "https://apu.edu.my/node/514",
  residences: "https://apu.edu.my/index.php/apu-off-campus-residence",
};
export const campusSites = [
  { id: "campus", name: "APU Campus", query: "Asia Pacific University Technology Park Malaysia Bukit Jalil Kuala Lumpur", aliases: ["apu campus", "library", "cafeteria", "block a", "block b", "block c", "block d"] },
  { id: "on-campus", name: "APU On-Campus Residence", query: "APU On Campus Residence Technology Park Malaysia", aliases: ["on-campus residence", "on campus residence", "j1", "j2", "k1", "k2"] },
  { id: "satellite", name: "Satellite Campus Residence", query: "APU Satellite Campus Residence Jalan Teknologi 9 Bukit Jalil", aliases: ["satellite"] },
  { id: "cog", name: "City of Green", query: "City of Green Jalan PBS 14/2 Seri Kembangan", aliases: ["city of green", "cog"] },
  { id: "harmony", name: "The Harmony", query: "The Harmony Old Klang Road Taman OUG Square Kuala Lumpur", aliases: ["harmony"] },
  { id: "divo", name: "D’IVO Residence", query: "D'IVO Residence Maluri Kuala Lumpur", aliases: ["d’ivo", "d'ivo", "divo"] },
  { id: "vertica", name: "M Vertica", query: "M Vertica 555 Jalan Cheras Kuala Lumpur", aliases: ["m vertica", "m-vertica"] },
  { id: "kuchai", name: "Kuchai Sentral", query: "Kuchai Sentral Kuchai Lama Kuala Lumpur", aliases: ["kuchai sentral"] },
  { id: "maple", name: "Maple Residence", query: "Maple Residence Sri Petaling Kuala Lumpur", aliases: ["maple"] },
  { id: "bloomsvale", name: "Bloomsvale", query: "Bloomsvale Jalan Puchong Kuala Lumpur", aliases: ["bloomsvale"] },
];

export function siteForLocation(location: string) {
  const text = location.toLowerCase();
  return [...campusSites.slice(1), campusSites[0]].find(site =>
    site.aliases.some(alias => new RegExp("(^|[^a-z0-9])" + alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)").test(text)),
  );
}

export function monthKey(at: number) {
  return new Date(at).toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).slice(0, 7);
}
export function periodStats(items: any[], month: string) {
  const cohort = items.filter(item => month === "all" || monthKey(item.started ?? item.at) === month);
  const active = cohort.filter(item => !["Resolved", "Closed"].includes(item.status));
  return {
    total: cohort.length,
    active: active.length,
    resolved: cohort.filter(item => item.status === "Resolved").length,
    confirmed: cohort.filter(item => item.status === "Closed").length,
    critical: active.filter(item => (item.severity || item.priority) === "Critical").length,
    assigned: cohort.filter(item => item.status === "Assigned").length,
    working: cohort.filter(item => ["Investigating", "Waiting Parts"].includes(item.status)).length,
    review: cohort.filter(item => item.status === "Verifying").length,
    pending: cohort.filter(item => item.status === "Needs triage").length,
  };
}
