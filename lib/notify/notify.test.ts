import { describe, expect, it } from 'vitest';
import { defaultStaffPath, renderEvent } from './events';
import { normalizePhone, waMeLink } from './channels';

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
