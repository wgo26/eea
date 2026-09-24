import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { loadThemeList } from '@/lib/branding'
import { PageHeader } from '@/components/admin/page-header'
import { ThemeCreateForm, type ThemeOption } from './theme-create-form'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.branding.createTitle }
}

export default async function Page() {
  const locale = await getRequestLocale()
  await requireCapability('branding.publish', '/admin/branding/new')
  const dict = getDictionary(locale)
  const t = dict.admin.branding

  const themes = await loadThemeList()
  const options: ThemeOption[] = themes
    .filter((theme) => theme.status !== 'archived')
    .map((theme) => ({ id: theme.id, name: theme.name, version: theme.version }))

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.createTitle}
        description={t.description}
        breadcrumb={[
          { label: dict.admin.sidebar.dashboard, href: localePath(locale, '/admin/dashboard') },
          { label: t.title, href: localePath(locale, '/admin/branding') },
          { label: t.createTitle },
        ]}
      />

      <ThemeCreateForm copy={t} common={dict.admin.common} themes={options} />
    </div>
  )
}
