import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";
const config: NextConfig = {
  outputFileTracingIncludes: { "/api/**/*": ["./lib/db/migration.sql"] },
};
export default withWorkflow(config);
