import { execFileSync } from "node:child_process";
for (const projection of ["compact", "full"]) {
  execFileSync("bun", ["scripts/test-production-infra.ts", projection], {
    env: { ...process.env, NODE_ENV: "production", VERCEL: "1" },
    stdio: "inherit",
  });
}
