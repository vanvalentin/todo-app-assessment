/**
 * Production deploy helpers. Every call shells out to the AWS CLI, so the workflow needs
 * no extra runtime dependency and the operations stay readable in the deploy log.
 *
 *   node ecs-deploy.mjs migrate --cluster <c> --family <f> --image <i>
 *        --subnet <s> --security-group <sg> [--region eu-west-1] [--timeout 900]
 *   node ecs-deploy.mjs roll --cluster <c> \
 *        --target <family>=<image> [--target <family>=<image> ...] \
 *        --service <s> [--service <s> ...] [--region eu-west-1]
 */
import { execFileSync } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

// Fields the RegisterTaskDefinition API rejects when echoed back from a describe call.
const readOnlyTaskDefinitionKeys = [
  "taskDefinitionArn",
  "revision",
  "status",
  "requiresAttributes",
  "compatibilities",
  "registeredAt",
  "registeredBy",
  "deregisteredAt",
  "enableFaultInjection",
];

function aws(args) {
  return execFileSync("aws", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

function awsJson(args) {
  try {
    return JSON.parse(aws(args));
  } catch (error) {
    throw new Error(`aws ${args.slice(0, 2).join(" ")}: unusable response (${String(error)})`);
  }
}

/** The container a task definition runs: the one whose name the family ends with. */
export function primaryContainer(taskDefinition) {
  const containers = taskDefinition.containerDefinitions ?? [];
  const family = taskDefinition.family ?? "";
  const match = containers.find((container) => family.endsWith(`-${container.name}`));
  const container = match ?? containers[0];
  if (!container) throw new Error(`Task definition ${family} has no container definitions`);
  return container;
}

/** Returns a RegisterTaskDefinition payload with the new image and read-only fields removed. */
export function withImage(taskDefinition, image) {
  const payload = { ...taskDefinition };
  for (const key of readOnlyTaskDefinitionKeys) delete payload[key];
  payload.containerDefinitions = (payload.containerDefinitions ?? []).map((container) => ({
    ...container,
    image: container.name === primaryContainer(taskDefinition).name ? image : container.image,
  }));
  return payload;
}

function parseArguments(argv) {
  const options = { region: process.env.AWS_REGION ?? "eu-west-1", timeout: "900" };
  const lists = { target: [], service: [] };
  let command;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (index === 0 && !token.startsWith("--")) {
      command = token;
      continue;
    }
    const value = argv[index + 1];
    if (!token.startsWith("--") || value === undefined) continue;
    index += 1;
    const key = token.slice(2);
    if (key === "target" || key === "service") lists[key].push(value);
    else options[key] = value;
  }
  return { command, options, targets: lists.target, services: lists.service };
}

function describeTaskDefinition(family, region) {
  return awsJson([
    "ecs",
    "describe-task-definition",
    "--task-definition",
    family,
    "--region",
    region,
    "--query",
    "taskDefinition",
    "--output",
    "json",
  ]);
}

function registerTaskDefinition(payload, region) {
  const registered = awsJson([
    "ecs",
    "register-task-definition",
    "--region",
    region,
    "--cli-input-json",
    JSON.stringify(payload),
    "--output",
    "json",
  ]);
  return registered.taskDefinition.taskDefinitionArn;
}

async function runMigrations(options, region) {
  const taskDefinition = describeTaskDefinition(options.family, region);
  const revision = registerTaskDefinition(withImage(taskDefinition, options.image), region);
  process.stdout.write(`Registered ${revision}\n`);

  const started = awsJson([
    "ecs",
    "run-task",
    "--cluster",
    options.cluster,
    "--task-definition",
    revision,
    "--launch-type",
    "FARGATE",
    "--started-by",
    "github-actions-migrate",
    "--network-configuration",
    JSON.stringify({
      awsvpcConfiguration: {
        subnets: [options.subnet],
        securityGroups: [options["security-group"]],
        assignPublicIp: "DISABLED",
      },
    }),
    "--region",
    region,
    "--output",
    "json",
  ]);
  const taskArn = started.tasks?.[0]?.taskArn;
  if (!taskArn) throw new Error("run-task did not return a task ARN");
  process.stdout.write(`Migration task ${taskArn} started\n`);

  const deadline = Date.now() + Number(options.timeout) * 1000;
  for (;;) {
    await delay(10000);
    const described = awsJson([
      "ecs",
      "describe-tasks",
      "--cluster",
      options.cluster,
      "--tasks",
      taskArn,
      "--region",
      region,
      "--output",
      "json",
    ]);
    const task = described.tasks?.[0];
    if (task?.lastStatus === "STOPPED") {
      for (const container of task.containers ?? []) {
        process.stdout.write(
          `Container ${container.name} exited with ${container.exitCode} (${container.reason ?? "no reason"})\n`,
        );
        if (container.exitCode !== 0) {
          process.stderr.write(
            `Migration failed. Check the ${container.name} stream in the /ecs logs group.\n`,
          );
          return 1;
        }
      }
      process.stdout.write("Migrations applied\n");
      return 0;
    }
    if (Date.now() > deadline) {
      process.stderr.write(`Migration task ${taskArn} did not finish in ${options.timeout}s\n`);
      return 1;
    }
  }
}

/** Parses `<family>=<image>` pairs; the deploy passes one per task definition family. */
export function parseTargets(targets) {
  const images = new Map();
  for (const target of targets) {
    const separator = target.indexOf("=");
    if (separator < 1) throw new Error(`Expected <family>=<image>, received: ${target}`);
    images.set(target.slice(0, separator), target.slice(separator + 1));
  }
  return images;
}

async function rollServices(options, targets, services, region) {
  const wanted = parseTargets(targets);
  const revisions = new Map();
  for (const [family, image] of wanted) {
    const revision = registerTaskDefinition(
      withImage(describeTaskDefinition(family, region), image),
      region,
    );
    revisions.set(family, revision);
    process.stdout.write(`Registered ${revision}\n`);
  }

  const expected = new Map();
  for (const service of services) {
    const family = [...wanted.keys()].find((candidate) => candidate.endsWith(`-${service}`));
    const revision = family === undefined ? undefined : revisions.get(family);
    if (!revision) {
      process.stderr.write(`No task definition family matches service ${service}\n`);
      return 1;
    }
    expected.set(service, revision);
    aws([
      "ecs",
      "update-service",
      "--cluster",
      options.cluster,
      "--service",
      service,
      "--task-definition",
      revision,
      "--region",
      region,
      "--query",
      "service.serviceName",
      "--output",
      "text",
    ]);
    process.stdout.write(`Updating ${service} to ${revision}\n`);
  }

  aws([
    "ecs",
    "wait",
    "services-stable",
    "--cluster",
    options.cluster,
    "--services",
    ...services,
    "--region",
    region,
  ]);

  // The circuit breaker can roll a service back and still reach steady state, so confirm
  // every service is actually running the revision this deploy registered.
  const described = awsJson([
    "ecs",
    "describe-services",
    "--cluster",
    options.cluster,
    "--services",
    ...services,
    "--region",
    region,
    "--output",
    "json",
  ]);
  let failed = false;
  for (const service of described.services ?? []) {
    const wanted = expected.get(service.serviceName);
    if (service.taskDefinition !== wanted) {
      process.stderr.write(
        `${service.serviceName} rolled back to ${service.taskDefinition} instead of ${wanted}\n`,
      );
      failed = true;
    } else {
      process.stdout.write(`${service.serviceName} is running ${wanted}\n`);
    }
  }
  return failed ? 1 : 0;
}

async function main(argv) {
  const { command, options, targets, services } = parseArguments(argv);
  const region = options.region;
  if (command === "migrate") {
    if (!options.cluster || !options.family || !options.image || !options.subnet) {
      process.stderr.write("migrate needs --cluster, --family, --image and --subnet\n");
      return 2;
    }
    if (!options["security-group"]) {
      process.stderr.write("migrate needs --security-group\n");
      return 2;
    }
    return runMigrations(options, region);
  }
  if (command === "roll") {
    if (!options.cluster || targets.length === 0 || services.length === 0) {
      process.stderr.write("roll needs --cluster, --target and --service\n");
      return 2;
    }
    return rollServices(options, targets, services, region);
  }
  process.stderr.write("Usage: ecs-deploy.mjs migrate|roll [options]\n");
  return 2;
}

if (process.argv[1]?.endsWith("ecs-deploy.mjs")) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
