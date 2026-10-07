#!/usr/bin/env bash
# Test the auth email templates locally
# Run from project root: ./supabase/test-auth-emails.sh

set -euo pipefail

echo "🧪 Testing auth email templates..."

# Create a simple test using Deno
cat > /tmp/test-templates.ts << 'EOF'
import { renderTemplate } from "./supabase/functions/send-auth-email/templates.ts";

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
      // Save HTML for inspection
      await Deno.writeTextFile(`/tmp/${type}-${locale}.html`, result.html);
    } catch (e) {
      console.error(`❌ ${type} (${locale}):`, e);
    }
  }
}

console.log("\n📄 HTML files written to /tmp/*.html");
EOF

deno run --allow-read --allow-write /tmp/test-templates.ts