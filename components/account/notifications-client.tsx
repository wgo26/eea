'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, BellRing, CheckCheck, Mail, MessageCircle, Save } from 'lucide-react';
import { markAllNotificationsRead, markNotificationRead, saveNotificationPrefs } from '@/lib/notify/actions';
import { localePath } from '@/lib/i18n/urls';
import type { Dictionary, Locale } from '@/lib/i18n';
import type { NotificationPrefs, UserNotification } from '@/lib/notify/queries';

/**
 * Account notifications: the user's alert inbox + channel preferences.
 * In-app always works; email/WhatsApp honor the toggles below (WhatsApp
 * off by default — highest open rates, but strictly opt-in).
 */
export function NotificationsClient({
  initial,
  prefs: initialPrefs,
  dict,
  locale,
}: {
  initial: UserNotification[];
  prefs: NotificationPrefs;
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.account.notifications;
  const [items, setItems] = useState(initial);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleMarkAll() {
    setBusy(true);
    const res = await markAllNotificationsRead();
    setBusy(false);
    if (res.ok) setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  async function handleOpen(n: UserNotification) {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      void markNotificationRead(n.id);
    }
  }

  async function handleSavePrefs(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await saveNotificationPrefs({ inapp: prefs.inapp, email: prefs.email, whatsapp: prefs.whatsapp });
    setBusy(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            {unread > 0 ? <BellRing className="h-4 w-4 text-primary" aria-hidden /> : <Bell className="h-4 w-4 text-muted-foreground" aria-hidden />}
            {unread > 0 ? `${unread} ${t.unread}` : t.title}
          </h2>
          {unread > 0 ? (
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              {t.markAllRead}
            </button>
          ) : null}
        </div>
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">{t.empty}</p>
        ) : (
          <ul className="space-y-2">
            {items.map((n) => (
              <li
                key={n.id}
                className={`rounded-2xl border p-4 transition-colors ${n.read ? 'bg-card' : 'border-primary/30 bg-primary/[0.04]'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-snug">{n.title}</p>
                    {n.body ? (
                      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{n.body}</p>
                    ) : null}
                  </div>
                  {!n.read ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label={t.unread} /> : null}
                </div>
                {n.path ? (
                  <Link
                    href={localePath(locale, n.path)}
                    onClick={() => handleOpen(n)}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-link hover:underline"
                  >
                    {t.open} →
                  </Link>
                ) : n.read ? null : (
                  <button
                    type="button"
                    onClick={() => handleOpen(n)}
                    className="mt-2 text-xs font-medium text-link hover:underline"
                  >
                    {t.markAllRead}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-5">
        <h2 className="text-sm font-bold">{t.prefsTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t.prefsBody}</p>
        <form onSubmit={handleSavePrefs} className="mt-4 space-y-3">
          {(
            [
              { key: 'inapp', label: t.channelInapp, icon: Bell },
              { key: 'email', label: t.channelEmail, icon: Mail },
              { key: 'whatsapp', label: t.channelWhatsapp, icon: MessageCircle },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <label key={key} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
              <input
                type="checkbox"
                checked={prefs[key]}
                onChange={(e) => setPrefs((p) => ({ ...p, [key]: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium">{label}</span>
            </label>
          ))}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" aria-hidden />
              {t.save}
            </button>
            {saved ? <span className="text-xs font-medium text-emerald-600">{t.prefsSaved}</span> : null}
          </div>
        </form>
      </section>
    </div>
  );
}
