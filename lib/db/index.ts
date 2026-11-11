import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { AsyncLocalStorage } from "node:async_hooks";
export type Ticket = {
  id: string;
  source: string;
  sourceId: string;
  summary: string;
  description: string;
  service: string;
  at: number;
  signature: string;
  jiraUrl?: string;
};
export type Probe = {
  id: string;
  at: number;
  health: number;
  query: number;
  expected: boolean;
  service: string;
};
export type Analysis = {
  bundleId: string;
  proposedTicketIds: string[];
  excludedTickets: { ticketId: string; reason: string }[];
  observations: { text: string; evidenceIds: string[] }[];
  hypotheses: { text: string; evidenceIds: string[] }[];
  conflicts: { text: string; evidenceIds: string[] }[];
  nextCheck: string;
  runbookSectionIds: string[];
  unknowns: string[];
};
export type State = {
  hub?: import("../incidents/coordination").Hub;
  revision: number;
  started: number;
  status: string;
  scenario: string;
  tickets: Ticket[];
  linked: string[];
  excluded: string[];
  probes: Probe[];
  analysis: Analysis | null;
  analysisSource: string;
  runReference: string;
  approval: null | {
    reviewer: string;
    revision: number;
    probeIds: string[];
    target: string;
    transition: string;
    targetStatus: string;
    expires: number;
    key: string;
  };
  action: null | {
    key: string;
    state: string;
    label: string;
    issue: string;
    status: string;
    at: number;
    detail: string;
  };
  owner: string;
  exportedBundle: string | null;
};
export function initial(): State {
  const at = Date.now() - 12 * 60_000;
  return {
    revision: 1,
    started: at,
    status: "Investigating",
    scenario: "outage",
    linked: [],
    excluded: [],
    probes: [],
    analysis: null,
    analysisSource: "",
    runReference: "",
    approval: null,
    action: null,
    owner: "Alex Morgan",
    exportedBundle: null,
    tickets: [
      {
        id: "T-1",
        source: "Fixture",
        sourceId: "HELP-1041",
        summary: "AIDA is not answering my questions",
        description:
          "My AIDA question has been spinning for several minutes. No answer comes back.",
        service: "AIDA",
        at: at + 60_000,
        signature: "unanswered-query",
      },
      {
        id: "T-2",
        source: "Fixture",
        sourceId: "HELP-1042",
        summary: "Study assistant stuck on loading",
        description:
          "Signed in fine, but every AIDA query hangs with no response.",
        service: "AIDA",
        at: at + 120_000,
        signature: "unanswered-query",
      },
      {
        id: "T-3",
        source: "Fixture",
        sourceId: "HELP-1043",
        summary: "No response from AIDA",
        description:
          "AIDA opens normally. Sending a question produces no reply.",
        service: "AIDA",
        at: at + 180_000,
        signature: "unanswered-query",
      },
      {
        id: "T-4",
        source: "Fixture",
        sourceId: "HELP-1044",
        summary: "Unable to sign in to my account",
        description:
          "My account says invalid password. A classmate can sign in and ask questions.",
        service: "AIDA",
        at: at + 180_000,
        signature: "account-login",
      },
      {
        id: "T-5",
        source: "Fixture",
        sourceId: "HELP-1045",
        summary: "LMS assignment upload failed",
        description: "An assignment PDF fails to upload in the LMS.",
        service: "LMS",
        at: at + 240_000,
        signature: "upload-failed",
      },
    ],
  };
}
// SQLite is the local authority. A Vercel deployment uses one external Postgres database.
let local: DatabaseSync | undefined;
function sqlite() {
  if (!local) {
    if (process.env.VERCEL)
      throw Error(
        "Shared database not configured. Set DATABASE_URL for the Vercel deployment.",
      );
    mkdirSync(resolve(".data"), { recursive: true });
    local = new DatabaseSync(
      resolve(
        /* turbopackIgnore: true */ process.env.FIXPILOT_DB ||
          ".data/fixpilot.sqlite",
      ),
    );
    local.exec("PRAGMA busy_timeout=5000;");
    local.exec(readFileSync(resolve("lib/db/migration.sql"), "utf8"));
    local
      .prepare("INSERT OR IGNORE INTO state VALUES(1,?)")
      .run(JSON.stringify(initial()));
  }
  return local;
}
const sql = process.env.DATABASE_URL
  ? postgres(process.env.DATABASE_URL, { max: 3, prepare: false })
  : null;
// A separate connection commits the action reservation before external HTTP begins.
const reservations = process.env.DATABASE_URL
  ? postgres(process.env.DATABASE_URL, { max: 1, prepare: false })
  : null;
const transaction = new AsyncLocalStorage<postgres.Sql>();
let initialized: Promise<void> | undefined;
const dbSchema = process.env.APP_DB_SCHEMA || "public";
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(dbSchema))
  throw Error("Invalid database schema");
const table = (name: string) => sql!(dbSchema + "." + name);
async function remote() {
  if (!sql) throw Error("Database unavailable");
  if (!initialized)
    initialized = sql
      .begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(17000)`;
        if (dbSchema !== "public")
          await tx`CREATE SCHEMA IF NOT EXISTS ${sql!(dbSchema)}`;
        await tx`CREATE TABLE IF NOT EXISTS ${table("state")} (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)`;
        await tx`CREATE TABLE IF NOT EXISTS ${table("audit")} (id BIGSERIAL PRIMARY KEY, actor TEXT NOT NULL, at BIGINT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL)`;
        await tx`CREATE TABLE IF NOT EXISTS ${table("actions")} (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
        await tx`INSERT INTO ${table("state")} VALUES (1,${JSON.stringify(initial())}) ON CONFLICT DO NOTHING`;
      })
      .then(() => undefined)
      .catch((e) => {
        initialized = undefined;
        throw e;
      });
  await initialized;
  return transaction.getStore() || sql;
}
export async function getState(): Promise<State> {
  if (sql) {
    const db = await remote();
    const rows = await db`SELECT value FROM ${table("state")} WHERE id=1`;
    return JSON.parse(rows[0].value);
  }
  const row = sqlite().prepare("SELECT value FROM state WHERE id=1").get() as {
    value: string;
  };
  return JSON.parse(row.value);
}
export async function save(s: State) {
  const value = JSON.stringify(s);
  if (sql) {
    const db = await remote();
    await db`UPDATE ${table("state")} SET value=${value} WHERE id=1`;
  } else sqlite().prepare("UPDATE state SET value=? WHERE id=1").run(value);
}
export async function audit(actor: string, event: string, detail: unknown) {
  const at = Date.now();
  const value = JSON.stringify(detail);
  if (sql) {
    const db = await remote();
    await db`INSERT INTO ${table("audit")}(actor,at,event,detail) VALUES(${actor},${at},${event},${value})`;
  } else
    sqlite()
      .prepare("INSERT INTO audit(actor,at,event,detail) VALUES(?,?,?,?)")
      .run(actor, at, event, value);
}
export async function events() {
  if (sql) {
    const db = await remote();
    return await db`SELECT * FROM ${table("audit")} ORDER BY id DESC LIMIT 50`;
  }
  return sqlite()
    .prepare("SELECT * FROM audit ORDER BY id DESC LIMIT 50")
    .all();
}
export async function action(key: string) {
  let row;
  if (sql) {
    const db = await remote();
    const rows =
      await db`SELECT value FROM ${table("actions")} WHERE key=${key}`;
    row = rows[0];
  } else
    row = sqlite().prepare("SELECT value FROM actions WHERE key=?").get(key) as
      | { value: string }
      | undefined;
  return row ? (JSON.parse(row.value) as NonNullable<State["action"]>) : null;
}
export async function reserve(
  key: string,
  value: NonNullable<State["action"]>,
) {
  if (sql) {
    await remote();
    const rows =
      await reservations!`INSERT INTO ${table("actions")} VALUES(${key},${JSON.stringify(value)}) ON CONFLICT DO NOTHING RETURNING key`;
    return rows.length === 1;
  }
  return (
    sqlite()
      .prepare("INSERT OR IGNORE INTO actions VALUES(?,?)")
      .run(key, JSON.stringify(value)).changes === 1
  );
}
export async function putAction(value: NonNullable<State["action"]>) {
  if (sql) {
    const db = await remote();
    await db`UPDATE ${table("actions")} SET value=${JSON.stringify(value)} WHERE key=${value.key}`;
  } else
    sqlite()
      .prepare("UPDATE actions SET value=? WHERE key=?")
      .run(JSON.stringify(value), value.key);
}
export async function reset() {
  await save(initial());
  if (sql) {
    const db = await remote();
    await db`DELETE FROM ${table("audit")}`;
    await db`DELETE FROM ${table("actions")}`;
  } else sqlite().exec("DELETE FROM audit; DELETE FROM actions;");
}

// Serialize case mutations across processes, including the final evidence recheck and write.
let queue: Promise<unknown> = Promise.resolve();
export async function withMutation<T>(fn: () => Promise<T>): Promise<T> {
  if (sql) {
    await remote();
    return (await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(17001)`;
      return await transaction.run(tx as unknown as postgres.Sql, fn);
    })) as T;
  }
  const previous = queue;
  let release!: () => void;
  queue = new Promise<void>((r) => {
    release = r;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

export async function close() {
  await sql?.end({ timeout: 5 });
  await reservations?.end({ timeout: 5 });
  local?.close();
  local = undefined;
}
