/**
 * Notification env verification (gap E — ops hardening).
 *
 * Presence + format check over the notify-related env vars. Warn-only by
 * design: missing providers are a supported state (the worker records honest
 * skips and delivers in-app), so unset vars warn but never fail. Malformed
 * values (bad port, non-URL webhook, template without base WhatsApp config)
 * exit 1 because they indicate a misconfiguration that silently degrades
 * delivery.
 *
 * Usage: node scripts/verify-notify-env.mjs  (reads .env.local + process env)
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadLocalEnv() {
    for (const file of [".env.local", ".env"]) {
        const path = join(root, file);
        if (!existsSync(path)) continue;
        for (const line of readFileSync(path, "utf8").split("\n")) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (m && process.env[m[1]] === undefined) {
                process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
            }
        }
    }
}

loadLocalEnv();

const get = (k) => (process.env[k] ?? "").trim();

const warnings = [];
const errors = [];

// --- SMTP (all-or-nothing; same host as Supabase custom SMTP) ---
const smtpHost = get("SMTP_HOST");
const smtpUser = get("SMTP_USER");
const smtpPass = get("SMTP_PASS");
const smtpPort = get("SMTP_PORT") || "587";
const smtpSet = [smtpHost, smtpUser, smtpPass].filter(Boolean).length;
if (smtpSet === 0) {
    warnings.push("SMTP_* unset — email channel reports not-configured; in-app only.");
} else if (smtpSet < 3) {
    errors.push("SMTP_* partially set — need SMTP_HOST + SMTP_USER + SMTP_PASS together.");
}
if (!/^\d+$/.test(smtpPort) || Number(smtpPort) < 1 || Number(smtpPort) > 65535) {
    errors.push(`SMTP_PORT invalid: ${JSON.stringify(smtpPort)} (expected 1–65535).`);
}
const smtpFrom = get("SMTP_FROM");
if (smtpFrom && !smtpFrom.includes("@")) {
    errors.push(`SMTP_FROM looks invalid: ${JSON.stringify(smtpFrom)} (expected "Name <addr@host>").`);
}

// --- WhatsApp base config ---
const waToken = get("WHATSAPP_TOKEN");
const waPhoneId = get("WHATSAPP_PHONE_NUMBER_ID");
const waSet = [waToken, waPhoneId].filter(Boolean).length;
if (waSet === 0) {
    warnings.push("WHATSAPP_* unset — WhatsApp reports not-configured; admin queue offers wa.me links.");
} else if (waSet < 2) {
    errors.push("WHATSAPP_* partially set — need WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID together.");
}
if (waPhoneId && !/^\d+$/.test(waPhoneId)) {
    errors.push("WHATSAPP_PHONE_NUMBER_ID invalid — expected digits only.");
}

// --- WhatsApp utility template (needs base config) ---
const waTemplate = get("WHATSAPP_TEMPLATE");
const waTemplateLang = get("WHATSAPP_TEMPLATE_LANG") || "en";
if (waTemplate && waSet < 2) {
    errors.push("WHATSAPP_TEMPLATE set without WHATSAPP_TOKEN/PHONE_NUMBER_ID — template sends need the base config.");
}
if (!waTemplate) {
    warnings.push("WHATSAPP_TEMPLATE unset — out-of-window sends (digest, stale alerts) fall back to best-effort free text.");
}
if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(waTemplateLang)) {
    errors.push(`WHATSAPP_TEMPLATE_LANG invalid: ${JSON.stringify(waTemplateLang)} (expected like "en" or "fr").`);
}
// French template is optional but must be paired correctly.
const waTemplateFr = get("WHATSAPP_TEMPLATE_FR");
const waTemplateFrLang = get("WHATSAPP_TEMPLATE_FR_LANG") || "fr";
if (waTemplateFr && !waTemplate) {
    errors.push("WHATSAPP_TEMPLATE_FR set without WHATSAPP_TEMPLATE — the base template is the English fallback.");
}
if (!waTemplateFr && waTemplate) {
    warnings.push("WHATSAPP_TEMPLATE_FR unset — French recipients get the base template language; submit the FR body from docs/whatsapp-template.md for full localisation.");
}
if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(waTemplateFrLang)) {
    errors.push(`WHATSAPP_TEMPLATE_FR_LANG invalid: ${JSON.stringify(waTemplateFrLang)} (expected like "fr").`);
}

// --- Cron + webhook ---
if (!get("CRON_SECRET")) {
    warnings.push("CRON_SECRET unset — /api/cron/* fail-closed in production; set a 16+ char secret on the host.");
} else if (get("CRON_SECRET").length < 16) {
    warnings.push("CRON_SECRET is short (<16 chars) — use a longer random secret in production.");
}
const webhook = get("DIGEST_WEBHOOK_URL");
if (!webhook) {
    warnings.push("DIGEST_WEBHOOK_URL unset — ops-digest webhook skipped (public subscriber fan-out still runs).");
} else if (!/^https:\/\//.test(webhook)) {
    errors.push("DIGEST_WEBHOOK_URL invalid — expected an https:// URL.");
}

for (const w of warnings) console.log(`WARN: ${w}`);
for (const e of errors) console.error(`ERROR: ${e}`);

if (errors.length > 0) {
    console.error(`notify-env check FAILED — ${errors.length} error(s).`);
    process.exit(1);
}
console.log(
    `notify-env OK: email=${smtpSet === 3 ? "configured" : "off"}, whatsapp=${waSet === 2 ? "configured" : "off"}, ` +
    `wa-template=${waTemplate ? "configured" : "off"}, webhook=${webhook ? "configured" : "off"}.`,
);
