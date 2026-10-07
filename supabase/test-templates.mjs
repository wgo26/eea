// Quick template test - run with: node supabase/test-templates.mjs
import { renderTemplate } from "./functions/send-auth-email/templates.ts";

const testData = {
  email: "test@example.com",
  confirmation_url: "https://eagleeyeafrica.org/auth/callback?code=abc123",
  new_email: "new@example.com",
  site_url: "https://eagleeyeafrica.org",
};

const types = ["confirmation", "recovery", "magic_link", "invite", "email_change", "password_changed"] as const;
const locales = ["en", "fr"];

for (const type of types) {
  for (const locale of locales) {
    try {
      const result = renderTemplate(type, locale, testData);
      console.log(`✅ ${type} (${locale}): ${result.subject}`);
    } catch (e) {
      console.error(`❌ ${type} (${locale}):`, e);
    }
  }
}