/**
 * Turns a `release/*` branch into the environment name used by DNS, the Compose project,
 * the database and the S3 bucket. Deploy and teardown share it so a branch always maps to
 * the same environment.
 *
 * Usage: tsx scripts/release-name.ts <branch>   → prints, for example, release-1-4
 */
import process from "node:process";

const maximumSuffixLength = 30;

/**
 * Returns the environment name for a release branch, or undefined when the ref is not a
 * release branch or has no usable characters left after sanitizing.
 */
export function releaseNameFromBranch(branch: string): string | undefined {
  if (!branch.startsWith("release/")) return undefined;
  const suffix = branch
    .slice("release/".length)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maximumSuffixLength)
    .replace(/-+$/g, "");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(suffix)) return undefined;
  return `release-${suffix}`;
}

function main(argv: readonly string[]): number {
  const [branch] = argv;
  if (!branch) {
    process.stderr.write("Usage: release-name <branch>\n");
    return 2;
  }
  const name = releaseNameFromBranch(branch);
  if (!name) {
    process.stderr.write(
      `Not a usable release branch: ${branch} (expected release/<name> with letters or digits)\n`,
    );
    return 1;
  }
  process.stdout.write(`${name}\n`);
  return 0;
}

if (process.argv[1]?.endsWith("release-name.ts")) {
  process.exitCode = main(process.argv.slice(2));
}
