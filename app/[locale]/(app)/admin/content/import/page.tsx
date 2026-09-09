import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { requireCapability } from '@/lib/auth/guards'
import { PageHeader } from '@/components/admin/page-header'
import { BloggerImportClient } from './import-client'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.content.importTitle }
}

export default async function Page() {
  await requireCapability('manageContent', '/admin/content')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)

  return (
    <div className="space-y-6">
      <PageHeader
        title={dict.admin.content.importTitle}
        description={dict.admin.content.importDescription}
      />
      <BloggerImportClient
        copy={dict.admin.content}
        typeFilters={dict.admin.typeFilters}
        locale={locale}
      />
    </div>
  )
}
