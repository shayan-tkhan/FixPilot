import { reset, close } from "./index.ts";
try {
  await reset();
} finally {
  await close();
}
console.log("Seeded FP-001 and five fictional reports.");
