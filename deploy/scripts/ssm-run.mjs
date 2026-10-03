/**
 * Runs one shell command on the preview host through SSM Run Command and reports its output.
 *
 * Usage: node ssm-run.mjs <instance-id> <command> [timeout-seconds]
 *
 * Uses the AWS CLI from the caller's environment so no SDK dependency is added here.
 */
import { execFileSync } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const pollIntervalMs = 5000;

function aws(args) {
  return execFileSync("aws", args, { encoding: "utf8" });
}

/** The CLI can return partial output; fail with the payload instead of a bare SyntaxError. */
function parseJson(text, context) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${context}: could not parse the AWS CLI response (${String(error)})`);
  }
}

async function main(argv) {
  const [instanceId, command, timeoutSeconds = "900"] = argv;
  if (!instanceId || !command) {
    process.stderr.write("Usage: ssm-run <instance-id> <command> [timeout-seconds]\n");
    return 2;
  }

  const commandId = aws([
    "ssm",
    "send-command",
    "--document-name",
    "AWS-RunShellScript",
    "--instance-ids",
    instanceId,
    "--comment",
    "ksat preview deploy",
    "--parameters",
    JSON.stringify({ commands: [command] }),
    "--query",
    "Command.CommandId",
    "--output",
    "text",
  ]).trim();
  process.stdout.write(`SSM command ${commandId} started on ${instanceId}\n`);

  const deadline = Date.now() + Number(timeoutSeconds) * 1000;
  for (;;) {
    await delay(pollIntervalMs);
    const invocation = parseJson(
      aws([
        "ssm",
        "get-command-invocation",
        "--command-id",
        commandId,
        "--instance-id",
        instanceId,
        "--output",
        "json",
      ]),
      `ssm get-command-invocation ${commandId}`,
    );
    const {
      Status: status,
      StandardOutputContent: stdout,
      StandardErrorContent: stderr,
    } = invocation;
    process.stdout.write(`[${status}] ${stdout ?? ""}${stderr ?? ""}`);
    if (status === "Success") return 0;
    if (status !== "Pending" && status !== "InProgress" && status !== "Delayed") {
      process.stderr.write(`SSM command ${commandId} finished with status ${status}\n`);
      return 1;
    }
    if (Date.now() > deadline) {
      process.stderr.write(`SSM command ${commandId} did not finish in ${timeoutSeconds}s\n`);
      return 1;
    }
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
