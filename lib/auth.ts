import { accounts } from "./accounts";
import {
  createHmac,
  randomBytes,
  timingSafeEqual,
  scryptSync,
} from "node:crypto";
import { cookies } from "next/headers";
const secret =
  process.env.SESSION_SECRET ||
  (globalThis as typeof globalThis & { demoSecret?: string }).demoSecret ||
  randomBytes(32).toString("hex");
(globalThis as typeof globalThis & { demoSecret?: string }).demoSecret = secret;
export type User = {
  id: string;
  role: "operator" | "reviewer" | "viewer" | "reporter" | "admin";
  name: string;
  tpNumber?: string;
};
export function login(email: string, password: string): User {
  if (
    process.env.VERCEL &&
    (!process.env.SESSION_SECRET ||
      process.env.SESSION_SECRET.length < 32 ||
      !process.env.DEMO_PASSWORD)
  )
    throw Error(
      "Configure SESSION_SECRET and DEMO_PASSWORD before enabling shared workflows",
    );
  const account = accounts.find((a) => a.id === email);
  const expected = process.env.DEMO_PASSWORD || "demo123";
  if (
    !account ||
    !timingSafeEqual(
      scryptSync(password, "fixpilot-demo", 32),
      scryptSync(expected, "fixpilot-demo", 32),
    )
  )
    throw Error("Invalid demo credentials");
  return { ...account };
}
function sign(v: string) {
  return createHmac("sha256", secret).update(v).digest("base64url");
}
export function token(user: User) {
  const payload = Buffer.from(
    JSON.stringify({ ...user, exp: Date.now() + 8 * 3600_000 }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export async function user() {
  const value = (await cookies()).get("fp_session")?.value;
  if (!value) return null;
  const [v, sig] = value.split(".");
  if (!v || !sig) return null;
  const expected = sign(v);
  if (
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  )
    return null;
  try {
    const u = JSON.parse(Buffer.from(v, "base64url").toString());
    return u.exp > Date.now() ? (u as User) : null;
  } catch {
    return null;
  }
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host") || new URL(req.url).host;
  const protocol =
    req.headers.get("x-forwarded-proto") ||
    new URL(req.url).protocol.slice(0, -1);
  if (
    !origin ||
    new URL(origin).host !== host ||
    new URL(origin).protocol !== protocol + ":"
  )
    throw Error("Same-origin request required");
}
