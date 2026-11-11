import { beforeEach, expect, it } from "vitest";
process.env.FIXPILOT_DB = ":memory:";
import { getState, save, reset } from "../lib/db";
import { mutateHub, readHub } from "../lib/incidents/coordination";
import type { User } from "../lib/auth";
const student: User = {
  id: "reporter@fixpilot.demo",
  role: "reporter",
  name: "Jamie",
};
const staff: User = {
  id: "reviewer@fixpilot.demo",
  role: "reviewer",
  name: "Sam",
};
const tech: User = {
  id: "operator@fixpilot.demo",
  role: "operator",
  name: "Alex",
};
const other: User = {
  id: "other@invalid.test",
  role: "reporter",
  name: "Other",
};
const input = {
  action: "report",
  category: "Water",
  summary: "Leaking tap",
  detail: "The tap will not stop leaking",
  location: "Hostel C",
};
beforeEach(async () => {
  await reset();
});
it("runs department assignment, technician proof, staff approval and reporter confirmation without monitoring", async () => {
  const created = await mutateHub(student, input);
  const id = (created as any).incident.id;
  const reportId = (created as any).report.id;
  expect((await readHub(student)).issues[0].status).toBe("Assigned");
  expect((await readHub(tech)).cases.some((issue) => issue.id === id)).toBe(false);
  await expect(
    mutateHub(tech, {
      action: "assign",
      id,
      team: "Maintenance",
      owner: tech.id,
      eta: 15,
    }),
  ).rejects.toThrow("Department staff");
  await mutateHub(staff, {
    action: "assign",
    id,
    team: "Maintenance",
    owner: tech.id,
    eta: 15,
  });
  expect((await readHub(tech)).cases.filter((issue) => issue.id === id)).toHaveLength(1);
  await expect(
    mutateHub(student, { action: "confirm", id: reportId }),
  ).rejects.toThrow("approve");
  await mutateHub(tech, { action: "work", id, step: "start" });
  await expect(
    mutateHub(tech, { action: "work", id, step: "complete" }),
  ).rejects.toThrow("completion note");
  const s = await getState();
  s.hub!.uploads = [
    {
      id: "proof",
      reportId,
      by: tech.id,
      purpose: "after",
      name: "after.png",
      type: "image/png",
      size: 10,
      path: "test",
      at: Date.now(),
    },
  ];
  await save(s);
  await mutateHub(tech, {
    action: "work",
    id,
    step: "complete",
    message: "Replaced the tap seal.",
  });
  await expect(
    mutateHub(tech, { action: "review", id, approve: true }),
  ).rejects.toThrow("Department staff");
  await expect(
    mutateHub(student, { action: "confirm", id: reportId }),
  ).rejects.toThrow("approve");
  await mutateHub(staff, { action: "review", id, approve: true });
  expect((await readHub(student)).issues[0].status).toBe("Resolved");
  expect((await readHub(student)).issues[0].attachments[0].id).toBe("proof");
  await expect(mutateHub(other, { action: "confirm", id })).rejects.toThrow(
    "Only the reporter",
  );
  await mutateHub(student, { action: "confirm", id: reportId });
  expect((await readHub(student)).issues[0].confirmed).toBe(true);
  expect((await readHub(student)).issues[0].status).toBe("Closed");
  await mutateHub(student, { action: "reopen", id: reportId });
  expect((await readHub(student)).issues[0].status).toBe("Assigned");
  expect((await readHub(student)).issues[0].confirmed).toBe(false);
  expect((await readHub(student)).issues[0].id).toBe(reportId);
});
it("keeps new reports separate until staff merge and preserves reporter privacy", async () => {
  const first: any = await mutateHub(student, input);
  const second: any = await mutateHub(other, input);
  expect(first.incident.id).not.toBe(second.incident.id);
  await expect(
    mutateHub(student, {
      action: "merge",
      id: second.incident.id,
      target: first.incident.id,
    }),
  ).rejects.toThrow("Staff permission");
  await mutateHub(staff, {
    action: "merge",
    id: second.incident.id,
    target: first.incident.id,
  });
  const own = await readHub(other);
  expect(own.issues).toHaveLength(1);
  expect(own.cases).toHaveLength(0);
  expect(own.reports).toHaveLength(0);
  expect(
    (await getState()).hub!.reports.find((r) => r.id === second.report.id)!
      .incidentId,
  ).toBe(first.incident.id);
  await expect(
    mutateHub(tech, { action: "work", id: first.incident.id, step: "start" }),
  ).rejects.toThrow("assigned technician");
});

it("returns a repair for more work and requires fresh photo proof", async () => {
  const created:any = await mutateHub(student,input);
  const id = created.incident.id;
  await mutateHub(staff,{action:"assign",id,team:"Maintenance",owner:tech.id,eta:null});
  await mutateHub(tech,{action:"work",id,step:"start"});
  const s = await getState();
  s.hub!.uploads=[{id:"proof",reportId:created.report.id,by:tech.id,purpose:"after",name:"after.png",type:"image/png",size:10,path:"test",at:Date.now()}];
  await save(s);
  await mutateHub(tech,{action:"work",id,step:"complete"});
  await mutateHub(staff,{action:"review",id,approve:false,message:"Tap is still leaking."});
  expect((await readHub(tech)).cases.find((issue) => issue.id === id)?.status).toBe("Investigating");
  const returned=await getState();
  returned.hub!.uploads![0].at=returned.hub!.cases.find(c=>c.id===id)!.workStartedAt!-1;
  await save(returned);
  await expect(mutateHub(tech,{action:"work",id,step:"complete"})).rejects.toThrow("completion note");
  expect((await readHub(student)).issues[0].updates.some(u=>u.text.includes("Tap is still leaking."))).toBe(true);
});
