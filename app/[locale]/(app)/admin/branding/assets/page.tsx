import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getBrandAssets } from '@/lib/admin/queries'
import { BRAND_ASSET_TYPES, type BrandAssetType } from '@/lib/branding/assets'
import { PageHeader } from '@/components/admin/page-header'
import { AssetLibrary } from '@/components/admin/asset-library'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.branding.assetsTitle }
}

/**
 * The asset library (plan Phase 3.2, spec §11). Filtering is a GET form so a
 * filtered view is linkable; the mutations live in the client grid.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; archived?: string }>
}) {
  const locale = await getRequestLocale()
  await requireCapability('branding.publish', '/admin/branding/assets')
  const dict = getDictionary(locale)
  const t = dict.admin.branding

  const params = await searchParams
  const type = (BRAND_ASSET_TYPES as readonly string[]).includes(params.type ?? '')
    ? (params.type as BrandAssetType)
    : undefined
  const search = params.q?.trim() || undefined
  const includeArchived = params.archived === '1'

  const assets = await getBrandAssets({ type, search, includeArchived })

  const selectCls = 'rounded-md border border-border bg-background px-2.5 py-1.5 text-xs'
  const inputCls = `${selectCls} min-w-[200px] flex-1`
  const btnCls = 'rounded-md border border-border px-2.5 py-1.5 text-xs font-medium'
  const labelCls = 'flex items-center gap-1.5 text-xs text-muted-foreground'

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.assetsTitle}
        description={t.assetsDescription}
        breadcrumb={[
          { label: dict.admin.sidebar.dashboard, href: localePath(locale, '/admin/dashboard') },
          { label: t.title, href: localePath(locale, '/admin/branding') },
          { label: t.assetsTitle },
        ]}
      />

      <form method="GET" className="flex flex-wrap items-end gap-2">
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ''}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchPlaceholder}
          className={inputCls}
        />
        <select name="type" defaultValue={params.type ?? ''} aria-label={t.assetTypeLabel} className={selectCls}>
          <option value="">{t.allTypes}</option>
          {BRAND_ASSET_TYPES.map((value) => (
            <option key={value} value={value}>
              {t.assetTypes[value]}
            </option>
          ))}
        </select>
        <label className={labelCls}>
          <input type="checkbox" name="archived" value="1" defaultChecked={includeArchived} />
          {t.includeArchived}
        </label>
        <button type="submit" className={btnCls}>
          {t.filter}
        </button>
      </form>

      <AssetLibrary assets={assets} copy={t} common={dict.admin.common} />
    </div>
  )
}
