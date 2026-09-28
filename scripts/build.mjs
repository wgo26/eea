/**
 * Production build wrapper — survives a dying PostCSS loader pool.
 *
 * Turbopack executes the project's PostCSS config (`@tailwindcss/postcss` in
 * postcss.config.mjs) inside a pool of spawned `node` child processes. In its
 * own docs: "PostCSS — Automatically processes PostCSS config files in a
 * Node.js worker pool."
 *
 * On a memory-constrained build host those children can fail at boot — before
 * the IPC handshake — and Turbopack surfaces it as a fatal internal panic:
 *
 *   FATAL: An unexpected Turbopack error occurred.
 *   [project]/app/inter_<hash>.module.css [app-rsc] (css module)
 *   Caused by:
 *   - Execution of evaluate_webpack_loader failed
 *   - creating new process
 *   - node process exited before we could connect to it with exit status: 0
 *
 * Two things make this environmental rather than a code bug:
 *   1. The named file is virtual. `inter_<hash>.module.css` is the CSS module
 *      `next/font/local` synthesizes for the `inter` font in app/layout.tsx —
 *      it never exists on disk. Any CSS asset can be the one reported.
 *   2. The reported asset moves between runs. Observed here:
 *      `app/inter_68f53a0d.module.css` (Linux) and
 *      `node_modules/leaflet.markercluster/dist/MarkerCluster.Default.css`
 *      (Windows, `0xc0000142` STATUS_DLL_INIT_FAILED). A source bug would
 *      reproduce on the same file every time; this does not.
 *
 * So the fix is bundler-level: retry with webpack, which runs the same PostCSS
 * pipeline in-process instead of in a fragile child pool. Verified equivalent
 * for this app — both paths emit the four self-hosted woff2 files and the
 * `--font-sans` / `--font-display` variables, and both prerender all pages.
 *
 * Why the retry is trustworthy: `withSentryConfig` injects a `webpack` function,
 * and Next disables the separate webpack build worker when one exists
 * (`useBuildWorker: false`, confirmed in .next/diagnostics). So the compile and
 * its PostCSS run in a single process, with no loader children to lose. Static
 * generation still uses its own worker pool on either bundler, but that pool is
 * not the component failing here.
 *
 * Usage:
 *   node scripts/build.mjs               # turbopack, then webpack on fallback
 *   node scripts/build.mjs --webpack     # force webpack, no retry
 *   node scripts/build.mjs --turbopack   # force turbopack, then webpack
 *   node scripts/build.mjs --no-retry    # one attempt, fail hard
 *
 * Environment:
 *   EEA_BUILD_BUNDLER=webpack  same as --webpack
 *   EEA_BUILD_STRICT=1         same as --no-retry (never change bundlers)
 *   EEA_BUILD_MAX_HEAP_MB=2048 set a --max-old-space-size for the build child
 *   EEA_NEXT_BIN=<path>        override the next binary (used by stub tests)
 */
import { spawn } from "node:child_process";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Overridable so the retry logic can be exercised against a stub in tests
// without a 3-minute real build.
const NEXT_BIN =
    process.env.EEA_NEXT_BIN ||
    join(root, "node_modules", "next", "dist", "bin", "next");

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(
        "Usage: node scripts/build.mjs [--webpack|--turbopack] [--no-retry]\n"
    );
    process.exit(0);
}

const forced = argv.includes("--webpack")
    ? "webpack"
    : argv.includes("--turbopack")
      ? "turbopack"
      : (process.env.EEA_BUILD_BUNDLER || "").toLowerCase() === "webpack"
        ? "webpack"
        : "turbopack";
const noRetry = argv.includes("--no-retry") || process.env.EEA_BUILD_STRICT === "1";

// Flags this wrapper owns. Anything else is forwarded to `next build`, so
// `npm run build -- --profile` and friends keep working unchanged.
const WRAPPER_FLAGS = new Set(["--webpack", "--turbopack", "--no-retry", "--help", "-h"]);
const PASSTHROUGH_ARGS = argv.filter((a) => !WRAPPER_FLAGS.has(a));

/**
 * Signatures of "the build host could not run a helper process", as opposed to
 * "the application code is broken". Only these justify a second bundler
 * attempt; a type error or a failing page must surface on the first pass, not
 * cost another full compile behind a webpack retry.
 */
const SPAWN_FAILURE_PATTERNS = [
    // Turbopack's loader child died before the IPC handshake (this bug).
    /node process exited before we could connect to it/i,
    /creating new process/i,
    // Turbopack's own fatal internal panic (child killed by the OS).
    /An unexpected Turbopack error occurred/i,
    /TurbopackInternalError/i,
    // Windows: DLL init failed for a spawned child = STATUS_DLL_INIT_FAILED.
    /0xc0000142/i,
    // V8 ran out of heap while servicing the build.
    /JavaScript heap out of memory/i,
    /out of memory/i,
];

const totalMemGb = os.totalmem() / 1e9;

/**
 * Heap ceiling, applied ONLY when explicitly configured.
 *
 * Deliberately not derived from os.totalmem(): NODE_OPTIONS is inherited by
 * every child the build spawns, and `next build` runs static generation across
 * a pool of worker processes. A blanket "--max-old-space-size=3072" is a
 * per-process ceiling multiplied across that pool, so it can exhaust the very
 * container memory that causes this failure. Choosing it requires knowing the
 * plan's real RAM, which makes it a human decision — and inside a container
 * os.totalmem() reports the HOST's RAM, not the cgroup limit, so an
 * automatically derived number cannot be trusted anyway.
 *
 * Set EEA_BUILD_MAX_HEAP_MB (e.g. 2048 on a 4 GB plan) to enable.
 */
const HEAP_CAP_FLAG = (() => {
    const explicit = Number(process.env.EEA_BUILD_MAX_HEAP_MB);
    return Number.isFinite(explicit) && explicit >= 256
        ? `--max-old-space-size=${Math.floor(explicit)}`
        : null;
})();

/**
 * Child environment. Every default is skipped when the caller (hPanel, CI)
 * already set the variable, so this never overrides configured values.
 */
function buildEnv() {
    const env = { ...process.env };
    env.NEXT_TELEMETRY_DISABLED ??= "1";

    if (HEAP_CAP_FLAG) {
        env.NODE_OPTIONS = env.NODE_OPTIONS
            ? `${env.NODE_OPTIONS} ${HEAP_CAP_FLAG}`
            : HEAP_CAP_FLAG;
    }
    return env;
}

/**
 * Run `next build`. Output is streamed straight through to our own stdout/stderr
 * so the platform log stays complete and live, while a copy of the tail is kept
 * for the pattern match above. next writes little, so 200 KB is ample.
 */
function runBuild(bundler) {
    const args = [NEXT_BIN, "build", ...PASSTHROUGH_ARGS];
    if (bundler === "webpack") args.push("--webpack");

    return new Promise((resolve) => {
        const child = spawn(process.execPath, args, {
            cwd: root,
            stdio: ["ignore", "pipe", "pipe"],
            env: buildEnv(),
        });

        let tail = "";
        const keep = (chunk) => {
            tail += chunk;
            if (tail.length > 200_000) tail = tail.slice(-100_000);
        };
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (c) => { keep(c); process.stdout.write(c); });
        child.stderr.on("data", (c) => { keep(c); process.stderr.write(c); });

        child.on("error", (err) =>
            resolve({ code: 1, tail: `${tail}\n${err.message}`, error: err })
        );
        child.on("close", (code) => resolve({ code: code ?? 1, tail, error: null }));
    });
}

const looksLikeSpawnFailure = (text) =>
    SPAWN_FAILURE_PATTERNS.some((re) => re.test(text));

async function main() {
    // Webpack was asked for explicitly, or the operator turned the safety net
    // off: one attempt, and its exit code is the answer.
    if (forced === "webpack" || noRetry) {
        process.stdout.write(`[eea build] bundler: ${forced} (single attempt)\n`);
        const { code } = await runBuild(forced);
        return code;
    }

    const attempts = [{ bundler: "turbopack" }, { bundler: "webpack" }];

    for (let i = 0; i < attempts.length; i++) {
        const { bundler } = attempts[i];
        const isLast = i === attempts.length - 1;
        process.stdout.write(
            `[eea build] attempt ${i + 1}/${attempts.length}: ${bundler} ` +
            `(host: ${os.cpus().length} cpus, ${totalMemGb.toFixed(1)} GB RAM)\n`
        );

        const { code, tail } = await runBuild(bundler);
        if (code === 0) {
            if (i > 0) {
                process.stdout.write(
                    "\n[eea build] webpack succeeded — the turbopack failure was a " +
                    "loader child-process\n  problem on this host, not a problem in " +
                    "the CSS file it named.\n"
                );
            }
            return 0;
        }

        // Real build error (types, config, prerender): do not mask it by
        // compiling again under a different bundler.
        if (!looksLikeSpawnFailure(tail)) {
            process.stdout.write(
                `\n[eea build] ${bundler} failed with an application error ` +
                `(exit ${code}) — no bundler fallback.\n`
            );
            return code;
        }

        if (isLast) return code;

        process.stdout.write(
            `\n[eea build] ${bundler} failed because a helper process could not ` +
            `start (exit ${code}).\n` +
            `  Retrying with webpack: it runs the PostCSS/Tailwind plugin ` +
            `in-process, so a host\n  that cannot spawn Turbopack's loader ` +
            `children still builds. The CSS file named in\n  the panic above is ` +
            `incidental, not broken (see scripts/build.mjs).\n\n`
        );
    }
    return 1;
}

// Set the code and let the process drain its own pipes before exiting; calling
// process.exit() here can truncate the tail of the build log on a CI host.
process.exitCode = await main();

