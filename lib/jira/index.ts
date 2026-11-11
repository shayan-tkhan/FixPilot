const mode = () => process.env.JIRA_MODE === "sandbox";
export const target = () =>
  mode() ? process.env.JIRA_PARENT_KEY || "" : "LOCAL-001";
export const transition = () =>
  mode() ? process.env.JIRA_TRANSITION_ID || "" : "local-resolve";
export const destination = () =>
  mode() ? process.env.JIRA_TARGET_STATUS_ID || "" : "local-resolved";
async function request(path: string, init?: RequestInit) {
  const base = process.env.JIRA_BASE_URL || "";
  if (!/^https:\/\/[a-zA-Z0-9-]+\.atlassian\.net$/.test(base))
    throw Error("Configure an HTTPS Jira Cloud sandbox URL");
  const r = await fetch(base + "/rest/api/3" + path, {
    ...init,
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`,
        ).toString("base64"),
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!r.ok) throw Error(`Jira HTTP ${r.status}`);
  return r.status === 204 ? null : r.json();
}
async function issue(key: string) {
  const allowed = (process.env.JIRA_ALLOWED_KEYS || "").split(",");
  if (!allowed.includes(key)) throw Error("Issue outside sandbox allowlist");
  const data = await request(
    `/issue/${encodeURIComponent(key)}?fields=project,status,summary,description,created,updated`,
  );
  if (data.fields.project.key !== process.env.JIRA_PROJECT_KEY)
    throw Error("Issue outside sandbox project");
  return data;
}
export async function syncTickets() {
  if (!mode()) return [];
  return Promise.all(
    (process.env.JIRA_ALLOWED_KEYS || "")
      .split(",")
      .filter(Boolean)
      .map(async (key) => {
        const i = await issue(key);
        return {
          id: key,
          source: "Jira sandbox",
          sourceId: key,
          summary: i.fields.summary,
          description: JSON.stringify(i.fields.description),
          service: "Review required",
          signature: "unknown",
          at: Date.parse(i.fields.created),
          jiraUrl: `${process.env.JIRA_BASE_URL}/browse/${key}`,
        };
      }),
  );
}
export async function execute(
  reconcileOnly = false,
  authorize?: () => Promise<void>,
) {
  if (!mode()) {
    await authorize?.();
    return {
      confirmed: true,
      already: false,
      status: "Resolved",
      detail: "Local stand-in transitioned and read back.",
      label: "Local demo update",
    };
  }
  const key = target();
  if (!key || !transition() || !process.env.JIRA_TARGET_STATUS_ID)
    throw Error("Sandbox action configuration incomplete");
  const before = await issue(key);
  if (before.fields.status.id === process.env.JIRA_TARGET_STATUS_ID)
    return {
      confirmed: reconcileOnly,
      already: true,
      status: before.fields.status.name,
      detail: reconcileOnly
        ? "Read-back confirms target status."
        : "Issue was already resolved before this attempt; no app transition performed.",
      label: "External status observed",
    };
  if (reconcileOnly)
    return {
      confirmed: false,
      already: false,
      status: before.fields.status.name,
      detail:
        "Target status not observed. Action remains Unconfirmed; no second write.",
      label: "Jira update unconfirmed",
    };
  const ts = await request(`/issue/${encodeURIComponent(key)}/transitions`);
  const t = ts.transitions.find(
    (t: { id: string; to: { id: string } }) =>
      t.id === transition() && t.to.id === process.env.JIRA_TARGET_STATUS_ID,
  );
  if (!t) throw Error("Configured transition or destination is unavailable");
  await authorize?.();
  await request(`/issue/${encodeURIComponent(key)}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id: t.id } }),
  });
  const after = await issue(key);
  const confirmed =
    after.fields.status.id === process.env.JIRA_TARGET_STATUS_ID;
  return {
    confirmed,
    already: false,
    status: after.fields.status.name,
    detail: confirmed
      ? "Sandbox transition verified by issue read-back."
      : "Read-back did not confirm target status.",
    label: confirmed ? "Jira update verified" : "Jira update unconfirmed",
  };
}
