// Disposable demo directory. University SSO and a managed staff directory replace this for a campus rollout.
export const technicianIds = [
  "operator@fixpilot.demo",
  "technician2@fixpilot.demo",
  "housekeeping@fixpilot.demo",
  "accommodation@fixpilot.demo",
  "maintenance@fixpilot.demo",
  "identity@fixpilot.demo",
  "learning@fixpilot.demo",
  "ai-services@fixpilot.demo",
  "device-support@fixpilot.demo",
  "applications@fixpilot.demo",
  "messaging@fixpilot.demo",
  "service-desk@fixpilot.demo",
] as const;
export const reviewerIds = [
  "reviewer@fixpilot.demo",
  "reviewer2@fixpilot.demo",
] as const;
export const accounts = [
  {
    id: "reporter@fixpilot.demo",
    role: "reporter",
    name: "Jamie Lee",
    tpNumber: "TP000001",
  },
  {
    id: "reporter2@fixpilot.demo",
    role: "reporter",
    name: "Noor Aziz",
    tpNumber: "TP000002",
  },
  { id: technicianIds[0], role: "operator", name: "Alex Morgan", teams: ["Network Operations"] },
  { id: technicianIds[1], role: "operator", name: "Riley Tan", teams: ["Facilities"] },
  { id: technicianIds[2], role: "operator", name: "Jordan Lim", teams: ["Housekeeping"] },
  { id: technicianIds[3], role: "operator", name: "Aisha Rahman", teams: ["Accommodation"] },
  { id: technicianIds[4], role: "operator", name: "Daniel Wong", teams: ["Maintenance"] },
  { id: technicianIds[5], role: "operator", name: "Mei Chen", teams: ["Identity & Access"] },
  { id: technicianIds[6], role: "operator", name: "Amir Hassan", teams: ["Learning Systems"] },
  { id: technicianIds[7], role: "operator", name: "Priya Shah", teams: ["AI Services"] },
  { id: technicianIds[8], role: "operator", name: "Ethan Lee", teams: ["Device Support"] },
  { id: technicianIds[9], role: "operator", name: "Sofia Tan", teams: ["Applications"] },
  { id: technicianIds[10], role: "operator", name: "Marcus Chan", teams: ["Messaging"] },
  { id: technicianIds[11], role: "operator", name: "Sara Ibrahim", teams: ["Service Desk"] },
  { id: reviewerIds[0], role: "reviewer", name: "Sam Chen" },
  { id: reviewerIds[1], role: "reviewer", name: "Priya Nair" },
  { id: "admin@fixpilot.demo", role: "admin", name: "Taylor Reed" },
] as const;
export const nameOf = (id: string) =>
  accounts.find((a) => a.id === id)?.name || id;
