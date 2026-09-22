/**
 * Production security-posture gate (EEAD-002 item 15).
 *
 * Consolidates the static checks that must ALL pass before go-live into one
 * `npm run verify:posture` entry point:
 *   1. anon-bundle gate (fonts + service-role must never reach client bundles)
 *   2. client-dictionary gate (delegated inside the anon-bundle gate)
 *   3. server-action export gate (sync exports break `next build`)
 *   4. bare-href gate (locale-less internal links; warning-only here because
 *      the script itself is advisory — exit 1 would break `npm run check`)
 *   5. migration manifest gate (names, order, duplicate timestamps)
 *   6. cron manifest gate (vercel.json ⇄ scheduled-jobs.yml agreement)
 *   7. sitemap route gate (static paths + dynamic segments resolve)
 *   8. data_requests RLS regression (the EEAD-002 P1 anonymous-read leak must
 *      stay closed: the init-schema `requester_email is not null` SELECT branch
 *      must be superseded by owner+staff-only USING in a later migration)
 *
 * Gates 1-3 and 5-7 are fail-closed (exit 1). Gate 4 is advisory. Gate 8 is
 * fail-closed: it scans every migration in lexicographic order and requires
 * the FINAL "Own data requests" policy definition to have no anonymous /
 * email-null-able SELECT branch.
 *
 * Usage: node scripts/verify-security-posture.mjs (exit 1 on any failure)
 */
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const fail = (msg) => {
    console.error(`  X ${msg}`);
    failures += 1;
};
const ok = (msg) => console.log(`  ok ${msg}`);

function runGate(label, cmd) {
    console.log(`\n[${label}]`);
    try {
        execSync(cmd, { cwd: root, stdio: "inherit" });
        ok(`${label} clean`);
    } catch {
        fail(`${label} gate reported failures (see output above)`);
    }
}

console.log("security posture — EEAD-002 production gates");

runGate("anon bundle", "node scripts/verify-anon-bundle.mjs");
runGate("server actions", "node scripts/verify-server-actions.mjs");
runGate("migrations", "node scripts/verify-migrations.mjs");
runGate("crons", "node scripts/verify-crons.mjs");
runGate("sitemap", "node scripts/verify-sitemap.mjs");

// --- advisory: bare-href drift (the upstream script never exits non-zero) ---
console.log("\n[bare hrefs — advisory]");
try {
    const out = execSync("node scripts/find-bare-hrefs.mjs", { cwd: root, encoding: "utf8" });
    if (/finding\(s\)/.test(out)) {
        console.log("  … bare-href findings present (advisory only — fix before go-live)");
        console.log(out.trim().split("\n").slice(0, 10).join("\n"));
    } else {
        ok("no locale-less internal links");
    }
} catch (err) {
    console.log(`  … bare-href audit could not run: ${err.message}`);
}

// --- fail-closed: data_requests RLS regression -------------------------------
// Replays every "Own data requests" policy definition in migration order; the
// LAST one wins (Postgres replaces the policy on CREATE). It must restrict
// SELECT to the owner (requester_id = auth.uid()) or staff, with no
// `requester_email is not null` anonymous-read branch.
console.log("\n[data_requests RLS]");
{
    const dir = join(root, "supabase", "migrations");
    let files = [];
    try {
        files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    } catch {
        fail(`cannot read migration directory ${dir}`);
    }
    const defs = [];
    for (const file of files) {
        const sql = readFileSync(join(dir, file), "utf8");
        const re = /create\s+policy\s+"Own data requests"[\s\S]*?;/gi;
        let m;
        while ((m = re.exec(sql)) !== null) defs.push({ file, ddl: m[0] });
    }
    if (defs.length === 0) {
        fail('no "Own data requests" policy definition found in supabase/migrations');
    } else {
        const last = defs[defs.length - 1];
        const normalized = last.ddl.toLowerCase().replace(/\s+/g, " ");
        // Only the USING clause governs SELECT visibility — `requester_email
        // is not null` in WITH CHECK (insert shape validation) is fine.
        const usingClause = normalized.split(/using\s*\(/)[1]?.split("with check")[0] ?? "";
        const leaksEmailBranch = /requester_email\s+is\s+not\s+null/.test(usingClause);
        const hasOwner = /requester_id\s*=\s*auth\.uid\(\)/.test(usingClause);
        const hasStaff = /is_staff\(\)/.test(usingClause);
        if (leaksEmailBranch) {
            fail(
                `"Own data requests" still permits anonymous reads via ` +
                    `\`requester_email is not null\` (last defined in ${last.file})`,
            );
        } else if (!hasOwner || !hasStaff) {
            fail(
                `"Own data requests" (last defined in ${last.file}) must scope ` +
                    `SELECT to requester_id = auth.uid() or is_staff()`,
            );
        } else {
            ok(`"Own data requests" scoped to owner + staff (last defined in ${last.file})`);
        }
    }
}

console.log("");
if (failures > 0) {
    console.log(`RESULT: ${failures} posture gate(s) failing — NOT production-ready.`);
    process.exit(1);
}
console.log("RESULT: clean — security posture gates pass.");
