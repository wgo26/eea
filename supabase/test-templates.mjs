import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const config = readFileSync(path.join(root, "supabase", "config.toml"), "utf8");
const templates = [
  { section: "[auth.email.template.confirmation]", file: "confirmation.html", variables: ["{{ .Email }}", "{{ .ConfirmationURL }}"] },
  { section: "[auth.email.template.recovery]", file: "recovery.html", variables: ["{{ .Email }}", "{{ .ConfirmationURL }}"] },
  { section: "[auth.email.template.magic_link]", file: "magic_link.html", variables: ["{{ .Email }}", "{{ .ConfirmationURL }}"] },
  { section: "[auth.email.template.invite]", file: "invite.html", variables: ["{{ .ConfirmationURL }}"] },
  { section: "[auth.email.template.email_change]", file: "email_change.html", variables: ["{{ .Email }}", "{{ .NewEmail }}", "{{ .ConfirmationURL }}"] },
  { section: "[auth.email.notification.password_changed]", file: "password_changed.html", variables: ["{{ .Email }}"] },
];

// The CLI (v2.101, verified empirically via `supabase db push`) resolves the
// two sections against different bases: [auth.email.template.*] is
// repo-root-relative (`./supabase/templates/`), while
// [auth.email.notification.*] is supabase-dir-relative (`./templates/`).
// A single prefix for all six fails validation — do not "normalize" these.
function expectedPrefix(section) {
  return section.startsWith("[auth.email.notification.")
    ? "./templates/"
    : "./supabase/templates/";
}

let failed = false;
for (const template of templates) {
  const fullPath = path.join(root, "supabase", "templates", template.file);
  // content_path is resolved by the Supabase CLI relative to different bases
  // per section (see expectedPrefix above), so assert the exact form.
  if (!config.includes(template.section) || !config.includes(`${expectedPrefix(template.section)}${template.file}`)) {
    console.error(`Missing local Supabase Auth configuration for ${template.file}`);
    failed = true;
    continue;
  }
  if (!existsSync(fullPath)) {
    console.error(`Missing email template: ${fullPath}`);
    failed = true;
    continue;
  }
  const content = readFileSync(fullPath, "utf8");
  for (const variable of template.variables) {
    if (!content.includes(variable)) {
      console.error(`${template.file} is missing Supabase template variable ${variable}`);
      failed = true;
    }
  }
}

if (failed) process.exitCode = 1;
else console.log(`Verified ${templates.length} configured Supabase Auth email templates.`);