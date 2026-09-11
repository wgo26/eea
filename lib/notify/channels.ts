import "server-only";

import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from "@/lib/observability/logger";

/**
 * Delivery channels. Every sender is fail-closed on config: unconfigured
 * channels resolve `{ delivered: false, skipped: '<reason>' }` so the worker
 * records honest skips instead of crashing the run.
 */

export type ChannelResult = { delivered: boolean; skipped?: string; error?: string };

/* ------------------------------------------------------------------ */
/* Email (SMTP — staff custom SMTP, same host as Supabase custom SMTP) */
/* ------------------------------------------------------------------ */

type SmtpConfig = { host: string; port: number; user: string; pass: string; from: string };

function smtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    user,
    pass,
    from: process.env.SMTP_FROM ?? 'Eagle Eye Africa <no-reply@eagleeyeafrica.org>',
  };
}

export function isEmailConfigured(): boolean {
  return smtpConfig() !== null;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const cfg = smtpConfig();
  if (!cfg) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    });
  }
  return transporter;
}

function emailHtml(title: string, body: string, ctaUrl: string | null, ctaLabel: string): string {
  const safe = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html><html><body style="margin:0;background:#f4f4f2;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#0f3d2e;color:#ffffff;padding:18px 24px;font-size:18px;font-weight:bold;">Eagle Eye Africa</td></tr>
<tr><td style="padding:24px;"><h1 style="margin:0 0 12px;font-size:20px;color:#111;">${safe(title)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#333;">${safe(body)}</p>
${ctaUrl ? `<a href="${safe(ctaUrl)}" style="display:inline-block;background:#0f3d2e;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;">${safe(ctaLabel)}</a>` : ''}
</td></tr>
<tr><td style="padding:16px 24px;font-size:12px;color:#888;border-top:1px solid #eee;">Seen by the community. Verified by Eagle Eye.</td></tr>
</table></td></tr></table></body></html>`;
}

export async function sendEmail(to: string, subject: string, title: string, body: string, ctaUrl: string | null): Promise<ChannelResult> {
  const cfg = smtpConfig();
  const transport = getTransporter();
  if (!cfg || !transport) return { delivered: false, skipped: 'SMTP not configured (SMTP_HOST/USER/PASS)' };
  if (!/^\S+@\S+\.\S+$/.test(to)) return { delivered: false, skipped: 'no usable email address' };
  try {
    await transport.sendMail({
      from: cfg.from,
      to,
      subject: subject.slice(0, 120),
      text: `${title}\n\n${body}${ctaUrl ? `\n\n${ctaUrl}` : ''}`,
      html: emailHtml(title, body, ctaUrl, 'Open Eagle Eye Africa'),
    });
    return { delivered: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('notify-email', 'send failed', { error: message, to: to.split('@')[1] ?? '?' });
    return { delivered: false, error: message };
  }
}

/* ------------------------------------------------------------------ */
/* WhatsApp (Meta Cloud API — text messages, template-ready later)     */
/* ------------------------------------------------------------------ */

function whatsappConfig(): { token: string; phoneNumberId: string } | null {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;
  return { token, phoneNumberId };
}

export function isWhatsAppConfigured(): boolean {
  return whatsappConfig() !== null;
}

/** Normalize freeform phone input to an international digit string. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/** wa.me deep link with prefilled text — staff manual fallback + message footers. */
export function waMeLink(phone: string, text: string): string | null {
  const to = normalizePhone(phone);
  if (!to) return null;
  return `https://wa.me/${to}?text=${encodeURIComponent(text.slice(0, 1000))}`;
}

export async function sendWhatsApp(to: string, text: string): Promise<ChannelResult> {
  const cfg = whatsappConfig();
  if (!cfg) return { delivered: false, skipped: 'WhatsApp not configured (WHATSAPP_TOKEN/PHONE_NUMBER_ID)' };
  const recipient = normalizePhone(to);
  if (!recipient) return { delivered: false, skipped: 'no usable phone number' };
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${cfg.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'text',
        text: { body: text.slice(0, 4000), preview_url: false },
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      logger.error('notify-whatsapp', 'send failed', { status: res.status, detail });
      return { delivered: false, error: `WhatsApp API ${res.status}` };
    }
    return { delivered: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('notify-whatsapp', 'exception', { error: message });
    return { delivered: false, error: message };
  }
}

/** Admin status panel data (booleans only — never leak secrets). */
export function channelStatus(): { email: boolean; whatsapp: boolean; webhook: boolean } {
  return {
    email: isEmailConfigured(),
    whatsapp: isWhatsAppConfigured(),
    webhook: Boolean(process.env.DIGEST_WEBHOOK_URL),
  };
}
