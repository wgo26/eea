import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { CREDENTIAL_CATEGORIES, isSecretStorageConfigured } from '@/lib/security/credential-manager'
import { PageHeader } from '@/components/admin/page-header'
import { CredentialCreateForm } from '../credential-create-form'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.secrets.createTitle }
}

/**
 * Spec §13 — creation is one of the only two moments the plaintext value is
 * ever displayed, so this page is a form feeding the one-time reveal panel and
 * nothing else. `CREDENTIAL_CATEGORIES` is passed down as a prop because
 * `lib/security/credential-manager.ts` is server-only.
 */
export default async function Page() {
  const locale = await getRequestLocale()
  await requireCapability('secrets.create', '/admin/secrets/new')
  const dict = getDictionary(locale)
  const t = dict.admin.secrets

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.createTitle}
        description={t.createHint}
        breadcrumb={[
          { label: dict.admin.sidebar.dashboard, href: localePath(locale, '/admin/dashboard') },
          { label: t.title, href: localePath(locale, '/admin/secrets') },
          { label: t.create },
        ]}
      />

      {!isSecretStorageConfigured() && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          {t.storageMissing}
        </p>
      )}

      <CredentialCreateForm copy={t} categories={CREDENTIAL_CATEGORIES} common={dict.admin.common} />
    </div>
  )
}
