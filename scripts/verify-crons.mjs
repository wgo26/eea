/**
 * Cron manifest verification (audit §1.2 — scheduler/deployment drift gate).
 *
 * The deployment target (Hostinger Business Node.js) cannot fire `vercel.json`
 * crons, so `.github/workflows/scheduled-jobs.yml` is the real scheduler. That
 * file drifted twice: `/api/cron/reminders` existed as an endpoint but was
 * never scheduled (event reminders silently never fired), and a job added at
 * the wrong indentation level became a root key instead of a job — it parsed
 * as YAML but GitHub would never run it. Both classes of bug are invisible to
 * review because the workflow still "looks" complete.
 *
 * This gate makes the two files provably agree:
 *   1. scheduled-jobs.yml parses as YAML;
 *   2. every `vercel.json` cron schedule has a scheduled entry here (nothing
 *      is deployed-but-unscheduled);
 *   3. every endpoint path in vercel.json is actually called by the workflow;
 *   4. every job's `if:` schedule gate names a declared cron, and its
 *      workflow_dispatch gate names a declared input option;
 *   5. no two jobs share a schedule gate (which would double-run one cron and
 *      starve the other).
 * Extra crons are allowed — the hourly watchdog is intentionally workflow-only.
 *
 * Usage: node scripts/verify-crons.mjs  (exit 1 on any error so CI gates)
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = join(root, ".github", "workflows", "scheduled-jobs.yml");
const vercelPath = join(root, "vercel.json");

let workflow;
let vercel;
try {
    workflow = loadYaml(readFileSync(workflowPath, "utf8"));
    vercel = JSON.parse(readFileSync(vercelPath, "utf8"));
} catch (err) {
    console.error(`ERROR: cannot read/parse cron manifests: ${err.message}`);
    process.exit(1);
}

const errors = [];

// GitHub parses YAML 1.1, where a bare `on:` key is a boolean; js-yaml v4 keeps
// it a string, so the trigger block is a normal lookup here.
const triggers = workflow?.on;
const jobs = workflow?.jobs;
if (!triggers || !jobs) {
    console.error("ERROR: scheduled-jobs.yml is missing an `on:` or `jobs:` block.");
    process.exit(1);
}

const schedules = Array.isArray(triggers.schedule) ? triggers.schedule : [];
const crons = schedules.map((s) => s?.cron).filter(Boolean);
const dispatchOptions = triggers.workflow_dispatch?.inputs?.job?.options ?? [];
const jobNames = Object.keys(jobs);

if (crons.length === 0) errors.push("scheduled-jobs.yml declares no `on.schedule` crons.");

// 2 + 3. vercel.json ⇄ workflow agreement.
const endpoints = Array.isArray(vercel?.crons) ? vercel.crons : [];
if (endpoints.length === 0) errors.push("vercel.json declares no crons.");

const source = readFileSync(workflowPath, "utf8");
for (const entry of endpoints) {
    const path = String(entry?.path ?? "").replace(/\?.*$/, "");
    if (!path) {
        errors.push("vercel.json has a cron entry with no path.");
        continue;
    }
    if (!crons.includes(entry.schedule)) {
        errors.push(
            `Cron schedule ${entry.schedule} (${path}) is declared in vercel.json but has no ` +
                `matching entry in scheduled-jobs.yml — it will never fire on the Hostinger target.`,
        );
    }
    if (!source.includes(path)) {
        errors.push(
            `Endpoint ${path} is declared in vercel.json but is never called by scheduled-jobs.yml.`,
        );
    }
}

// 4 + 5. Each job's gate must resolve to a declared cron/option, and be unique.
const seenGates = new Map();
const jobDispatches = new Map();
for (const [name, job] of Object.entries(jobs)) {
    const condition = typeof job?.if === "string" ? job.if : "";
    if (!condition) {
        errors.push(`Job "${name}" has no \`if:\` gate — it would run on every scheduled event.`);
        continue;
    }
    const gate = condition.match(/github\.event\.schedule == '([^']+)'/)?.[1];
    // Collect EVERY dispatch option the job accepts (e.g. `'reminders' || 'both'`),
    // not just the first — a job that silently drops `both` would never run on a
    // default manual dispatch.
    const dispatches = [...condition.matchAll(/inputs\.job == '([^']+)'/g)].map((m) => m[1]);

    if (!gate) {
        errors.push(`Job "${name}" has no \`github.event.schedule == '<cron>'\` guard.`);
    } else if (!crons.includes(gate)) {
        errors.push(`Job "${name}" gates on "${gate}", which is not a declared \`on.schedule\` cron.`);
    } else if (seenGates.has(gate)) {
        errors.push(
            `Jobs "${seenGates.get(gate)}" and "${name}" share the schedule gate "${gate}" — ` +
                `only one cron would ever be satisfied, starving the other.`,
        );
    } else {
        seenGates.set(gate, name);
    }

    if (dispatches.length === 0) {
        errors.push(
            `Job "${name}" has no \`inputs.job == '<option>'\` guard, so it is unreachable ` +
                `from \`workflow_dispatch\`.`,
        );
    }
    for (const option of dispatches) {
        if (!dispatchOptions.includes(option)) {
            errors.push(
                `Job "${name}" dispatch gate "${option}" is not an option in ` +
                    `\`workflow_dispatch.inputs.job.options\`.`,
            );
        }
    }
    jobDispatches.set(name, dispatches);
}

// Let the operator reach every job by hand: each job gate must be dispatchable.
for (const name of jobNames) {
    const reachable = dispatchOptions.includes(name);
    if (!reachable) {
        errors.push(`Job "${name}" cannot be triggered manually (missing from dispatch options).`);
    }
}

// `both` is the default dispatch option and means "run every job", so each job
// must accept it. A job that lists only its own name would be silently skipped
// by a default manual run — the same silent-skip failure mode as an unscheduled
// cron, which is exactly what this gate exists to prevent.
const BROADCAST = "both";
if (dispatchOptions.includes(BROADCAST)) {
    for (const [name, dispatches] of jobDispatches) {
        if (!dispatches.includes(BROADCAST)) {
            errors.push(
                `Job "${name}" does not accept the "${BROADCAST}" dispatch option, so it would ` +
                    `be silently skipped by a default manual run (default: ${BROADCAST}).`,
            );
        }
    }
}

const scheduledJobNames = [...seenGates.values()];
if (scheduledJobNames.length === 0) {
    errors.push("No job in scheduled-jobs.yml is wired to an `on.schedule` cron.");
}

if (errors.length > 0) {
    for (const e of errors) console.error(`ERROR: ${e}`);
    console.error(`Cron manifest check FAILED — ${errors.length} error(s).`);
    process.exit(1);
}

const extra = crons.filter((c) => !endpoints.some((e) => e.schedule === c));
console.log(
    `Cron manifest OK: ${endpoints.length} endpoint(s) scheduled, ${jobNames.length} job(s) ` +
        `(${scheduledJobNames.join(", ")})` +
        (extra.length ? `, workflow-only cron(s): ${extra.join(", ")}` : "") +
        ".",
);