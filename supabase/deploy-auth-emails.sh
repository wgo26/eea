#!/usr/bin/env bash
# Deploy locale-aware auth email Edge Function and configure Supabase
# Run from project root: ./supabase/deploy-auth-emails.sh

set -euo pipefail

PROJECT_REF="tqknaklxyqpgvvfmyrkb"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"

echo "🚀 Deploying send-auth-email Edge Function..."

# 1. Deploy Edge Function
supabase functions deploy send-auth-email \
  --project-ref "${PROJECT_REF}" \
  --no-verify-jwt

echo "✅ Edge Function deployed"

# 2. Set secrets (requires SMTP credentials in .env)
echo "🔐 Setting Edge Function secrets..."
supabase secrets set \
  SMTP_HOST="${SMTP_HOST}" \
  SMTP_PORT="${SMTP_PORT}" \
  SMTP_USER="${SMTP_USER}" \
  SMTP_PASS="${SMTP_PASS}" \
  SMTP_FROM="${SMTP_FROM}" \
  --project-ref "${PROJECT_REF}"

echo "✅ Secrets set"

# 3. Run migration for hooks (requires DB access)
echo "📦 Running auth email hooks migration..."
supabase db push --project-ref "${PROJECT_REF}" --include-all

echo "✅ Migration applied"

# 4. Configure Postgres settings for Edge Function URL/Key
echo "⚙️  Configuring Postgres settings..."
psql "postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.${PROJECT_REF}.supabase.co:5432/postgres" <<EOF
ALTER DATABASE postgres SET app.edge_function_url = '${SUPABASE_URL}';
ALTER DATABASE postgres SET app.edge_function_key = '${NEXT_PUBLIC_SUPABASE_ANON_KEY}';
EOF

echo "✅ Postgres settings configured"

# 5. Enable hooks via Management API (requires Personal Access Token)
echo "🔗 To enable hooks, go to Dashboard → Authentication → Hooks and add:"
echo "   before_user_created      → auth.before_user_created_hook"
echo "   password_recovery        → auth.password_recovery_hook"
echo "   magic_link               → auth.magic_link_hook"
echo "   email_change             → auth.email_change_hook"
echo "   password_changed         → auth.password_changed_hook"
echo "   invite_user              → auth.invite_user_hook"

echo ""
echo "🎉 Deployment complete! Test with:"
echo "   curl -X POST ${SUPABASE_URL}/functions/v1/send-auth-email \\"
echo "     -H 'Authorization: Bearer ${NEXT_PUBLIC_SUPABASE_ANON_KEY}' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"type\":\"recovery\",\"user_id\":\"test-user-id\",\"email\":\"test@example.com\",\"confirmation_url\":\"${SUPABASE_URL}/auth/callback?code=test\"}'"