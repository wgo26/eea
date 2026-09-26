import { assertCapability } from '@/lib/admin/auth'
import { resolveLocale } from '@/lib/i18n/config'
import {
  exportSecurityTrail,
  isSecurityCategory,
  type SecurityEventRow,
} from '@/lib/admin/queries'

const CSV_COLUMNS = [
  'id',
  'action',
  'category',
  'actor_id',
  'actor_name',
  'actor_role',
  'resource_type',
  'resource_id',
  'source',
  'created_at',
] as const

function csv(value: unknown): string {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function rowToCsv(row: SecurityEventRow): string {
  return [
    row.id,
    row.action,
    row.category,
    row.actorId,
    row.actorName,
    row.actorRole,
    row.resourceType,
    row.resourceId,
    row.source,
    row.createdAt,
  ]
    .map(csv)
    .join(',')
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  try {
    await assertCapability('system.owner')
  } catch {
    return new Response('Forbidden', { status: 403 })
  }

  const { locale: rawLocale } = await params
  void resolveLocale(rawLocale)

  const { searchParams } = new URL(request.url)
  const categoryParam = searchParams.get('category')
  const category = isSecurityCategory(categoryParam) ? categoryParam : 'all'

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode(`${CSV_COLUMNS.join(',')}\n`))
      try {
        for await (const rows of exportSecurityTrail({
          category,
          from: searchParams.get('from') || undefined,
          to: searchParams.get('to') || undefined,
        })) {
          for (const row of rows) {
            controller.enqueue(encoder.encode(`${rowToCsv(row)}\n`))
          }
        }
      } catch (error) {
        controller.error(error)
        return
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="security-events.csv"',
      'Cache-Control': 'no-store',
    },
  })
}
