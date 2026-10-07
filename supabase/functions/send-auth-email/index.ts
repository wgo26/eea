import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderTemplate } from "./templates.ts";
import { sendEmail as sendSMTPEmail } from "./smtp.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("NEXT_PUBLIC_SITE_URL")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type EmailType = "confirmation" | "recovery" | "magic_link" | "invite" | "email_change" | "password_changed";

interface EmailPayload {
  type: EmailType;
  user_id: string;
  email: string;
  confirmation_url?: string;
  new_email?: string;
}

async function getUserLocale(userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("locale")
    .eq("id", userId)
    .single();
  return data?.locale || "en";
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload: EmailPayload = await req.json();
    const locale = await getUserLocale(payload.user_id);
    
    const { subject, html } = renderTemplate(payload.type, locale, {
      email: payload.email,
      confirmation_url: payload.confirmation_url,
      new_email: payload.new_email,
      site_url: SITE_URL,
    });

    await sendSMTPEmail({
      from: Deno.env.get("SMTP_FROM")!,
      to: payload.email,
      subject,
      html,
    });
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Auth email error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});