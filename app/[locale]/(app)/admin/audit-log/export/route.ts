import { assertCapability } from '@/lib/admin/auth'
import { resolveLocale } from '@/lib/i18n/config'
import { exportAuditTrail, type AuditOrigin, type AuditTrailRow } from '@/lib/admin/queries'

const CSV_COLUMNS = [
  'id',
  'origin',
  'action',
  'resource_type',
  'resource_id',
  'actor_id',
  'actor_name',
  'actor_role',
  'source',
  'request_id',
  'from_status',
  'to_status',
  'notes',
  'created_at',
] as const

function csv(value: unknown): string {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function rowToCsv(row: AuditTrailRow): string {
  return [
    row.id,
    row.origin,
    row.action,
    row.resourceType,
    row.resourceId,
    row.actorId,
    row.actorName,
    row.actorRole,
    row.source,
    row.requestId,
    row.fromStatus,
    row.toStatus,
    row.notes,
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
    await assertCapability('viewAuditLog')
  } catch {
    return new Response('Forbidden', { status: 403 })
  }

  const { locale: rawLocale } = await params
  const locale = resolveLocale(rawLocale)

  const { searchParams } = new URL(request.url)
  const originParam = searchParams.get('origin')
  const origin: AuditOrigin | 'all' =
    originParam === 'system' || originParam === 'moderation' ? originParam : 'all'

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode(`${CSV_COLUMNS.join(',')}\n`))
      try {
        for await (const rows of exportAuditTrail({
          action: searchParams.get('action') || undefined,
          resourceType: searchParams.get('resource') || undefined,
          origin,
          search: searchParams.get('q') || undefined,
          from: searchParams.get('from') || undefined,
          to: searchParams.get('to') || undefined,
          order: 'newest',
          locale,
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
      'Content-Disposition': 'attachment; filename="audit-log.csv"',
      'Cache-Control': 'no-store',
    },
  })
}
