import { loadBrandIdentity } from '@/lib/branding/identity'
import { PWA_ICON_BG } from '@/lib/pwa/icons'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['siteContent']

/**
 * App-install (PWA) status card for /admin/site-content.
 *
 * Server-rendered proof that the install experience follows the brand: the
 * live app name plus the actual icon PNGs the manifest serves (rendered from
 * the same logo the header uses). An editor who uploads a logo sees here
 * exactly what lands on a reader's home screen — no separate "regenerate
 * icons" step exists because there is nothing to regenerate.
 */
export async function PwaCard({ copy }: { copy: Copy }) {
  const identity = await loadBrandIdentity()
  const icons = [
    { src: '/app-icons/icon-192.png', label: '192' },
    { src: '/app-icons/icon-512.png', label: '512' },
    { src: '/app-icons/icon-512-maskable.png', label: 'maskable' },
    { src: '/app-icons/apple-touch-icon.png', label: 'Apple' },
  ]
  return (
    <div className="rounded-2xl border bg-card p-4 md:p-5">
      <h3 className="text-sm font-bold">{copy.pwaTitle}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.pwaBody}</p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex items-end gap-2">
          {icons.map((icon, i) => (
            <figure key={icon.src} className="text-center">
              {/* Plain img: these are the exact bytes the manifest serves. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${icon.src}?v=${encodeURIComponent(identity.logoUrl ?? 'builtin')}`}
                alt=""
                width={i === 0 ? 40 : 48}
                height={i === 0 ? 40 : 48}
                className="rounded-xl border border-border"
                loading="lazy"
              />
              <figcaption className="mt-1 text-xs text-muted-foreground">{icon.label}</figcaption>
            </figure>
          ))}
        </div>
        <dl className="min-w-[200px] flex-1 space-y-1.5 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{copy.pwaNameLabel}</dt>
            <dd className="font-bold">{identity.siteName}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{copy.pwaThemeLabel}</dt>
            <dd className="inline-flex items-center gap-1.5 font-mono">
              <span
                aria-hidden
                className="inline-block h-3.5 w-3.5 rounded border border-border"
                style={{ backgroundColor: PWA_ICON_BG }}
              />
              {PWA_ICON_BG}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{copy.pwaManifestLabel}</dt>
            <dd>
              <a href="/manifest.webmanifest" className="font-medium text-primary hover:underline">
                /manifest.webmanifest
              </a>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{copy.pwaOfflineLabel}</dt>
            <dd className="font-medium text-emerald-600">/offline ✓</dd>
          </div>
        </dl>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {copy.pwaIconsLabel} — {copy.pwaIconsHint}
        {!identity.logoUrl ? (
          <>
            <br />
            {copy.pwaNoLogo}
          </>
        ) : null}
      </p>
    </div>
  )
}
