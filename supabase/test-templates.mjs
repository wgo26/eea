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

let failed = false;
for (const template of templates) {
  const fullPath = path.join(root, "supabase", "templates", template.file);
  if (!config.includes(template.section) || !config.includes(`./supabase/templates/${template.file}`)) {
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