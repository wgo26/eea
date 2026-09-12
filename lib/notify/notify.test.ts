import { afterEach, describe, expect, it } from 'vitest';
import { defaultStaffPath, renderEvent } from './events';
import { isWindowError, normalizePhone, waMeLink, whatsappTemplateFor } from './channels';
import { isReceiptEmail } from './guest-receipts';
import { doualaHour, isQuietHour } from './worker';

describe('notify events', () => {
  it('renders staff alerts bilingually', () => {
    const r = renderEvent({ event: 'submission.received', audience: 'staff', data: { type: 'news', title: 'Flood', from: 'Amina' } });
    expect(r.title).toContain('news');
    expect(r.titleFr).toContain('Nouvelle');
    expect(r.body).toContain('Amina');
  });

  it('renders user receipts without review language', () => {
    const r = renderEvent({ event: 'submission.confirmation', audience: 'user', data: { title: 'X' } });
    expect(r.body).not.toMatch(/moderation queue/i);
    expect(r.bodyFr).toContain('file éditoriale');
  });

  it('routes staff events to the right admin screens', () => {
    expect(defaultStaffPath('submission.received')).toBe('/admin/moderation');
    expect(defaultStaffPath('advertise.inquiry')).toContain('/admin/ads');
    expect(defaultStaffPath('legal.takedown')).toBe('/admin/policies');
    expect(defaultStaffPath('content.correction')).toBe('/admin/trust-safety');
  });
});

describe('notify channels', () => {
  it('normalizes phone numbers', () => {
    expect(normalizePhone('+237 6 12 34 56 78')).toBe('237612345678');
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it('builds wa.me fallback links', () => {
    expect(waMeLink('+237612345678', 'hello') ?? '').toContain('wa.me/237612345678');
    expect(waMeLink('bad', 'hello')).toBeNull();
  });
});

describe('guest receipts', () => {
  it('accepts only valid emails (one-off receipts, never a list)', () => {
    expect(isReceiptEmail('amina@example.com')).toBe(true);
    expect(isReceiptEmail('bad')).toBe(false);
    expect(isReceiptEmail('')).toBe(false);
    expect(isReceiptEmail(null)).toBe(false);
    expect(isReceiptEmail(undefined)).toBe(false);
  });
});

describe('quiet hours', () => {
  it('holds sends inside a same-day window', () => {
    expect(isQuietHour(23, 22, 7)).toBe(true);
    expect(isQuietHour(12, 22, 7)).toBe(false);
    expect(isQuietHour(10, 9, 18)).toBe(true);
    expect(isQuietHour(20, 9, 18)).toBe(false);
  });

  it('wraps midnight and treats empty windows as off', () => {
    expect(isQuietHour(3, 22, 7)).toBe(true);
    expect(isQuietHour(22, 22, 7)).toBe(true);
    expect(isQuietHour(7, 22, 7)).toBe(false);
    expect(isQuietHour(12, null, null)).toBe(false);
    expect(isQuietHour(12, 8, 8)).toBe(false);
    expect(isQuietHour(12, 99, 7)).toBe(false);
    expect(isQuietHour(12, null, 7)).toBe(false);
  });

  it('resolves Douala local hours (UTC+1, no DST)', () => {
    // 2026-09-12T06:00:00Z == 07:00 in Douala.
    expect(doualaHour(new Date('2026-09-12T06:00:00Z'))).toBe(7);
    expect(doualaHour(new Date('2026-09-12T22:30:00Z'))).toBe(23);
  });
});

describe('whatsapp window errors', () => {
  it('detects the Meta 24h-window rejection', () => {
    expect(isWindowError('WhatsApp API 400: {"error":{"code":131047}}')).toBe(true);
    expect(isWindowError('WhatsApp API 400: bad request')).toBe(false);
    expect(isWindowError('')).toBe(false);
  });
});

describe('whatsapp template locale routing', () => {
  afterEach(() => {
    delete process.env.WHATSAPP_TEMPLATE;
    delete process.env.WHATSAPP_TEMPLATE_LANG;
    delete process.env.WHATSAPP_TEMPLATE_FR;
    delete process.env.WHATSAPP_TEMPLATE_FR_LANG;
  });

  it('returns null without a base template and routes fr to the twin', () => {
    expect(whatsappTemplateFor('en')).toBeNull();
    process.env.WHATSAPP_TEMPLATE = 'eea_alert_en';
    expect(whatsappTemplateFor('en')).toEqual({ name: 'eea_alert_en', lang: 'en' });
    // French falls back to the base language until the twin is set.
    expect(whatsappTemplateFor('fr')).toEqual({ name: 'eea_alert_en', lang: 'en' });
    process.env.WHATSAPP_TEMPLATE_FR = 'eea_alert_fr';
    expect(whatsappTemplateFor('fr')).toEqual({ name: 'eea_alert_fr', lang: 'fr' });
    expect(whatsappTemplateFor('FR')).toEqual({ name: 'eea_alert_fr', lang: 'fr' });
  });
});
