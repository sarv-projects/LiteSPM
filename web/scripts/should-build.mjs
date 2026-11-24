// Vercel: exit 0 only for proven non-web changes; exit 1 to build.
import { execFileSync } from "node:child_process";
const previous = process.env.VERCEL_GIT_PREVIOUS_SHA;
const current = process.env.VERCEL_GIT_COMMIT_SHA;
const sha = /^[0-9a-f]{40}$/i;
function maySkip(files) {
  return files.length > 0 && files.every(file =>
    /^(?:cmd|internal|test|docs|audits)\//.test(file) ||
    /^(?:go\.mod|go\.sum|npm\/test_npm\.js)$/.test(file) || /^npm\/bin\//.test(file)
  );
}
if (!previous || !current || previous === current || !sha.test(previous) || !sha.test(current)) process.exit(1);
try {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  // Compare to last successful deployment, not HEAD^: catches multi-commit pushes.
  const files = execFileSync("git", ["diff", "--name-only", "-z", "--no-renames", previous, current, "--"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const skip = maySkip(files);
  console.log(skip ? "Skipping non-web-only change" : "Web impact possible; continuing build");
  process.exit(skip ? 0 : 1);
} catch {
  // Shallow clones, missing commits and unknown state must never suppress a build.
  process.exit(1);
}
