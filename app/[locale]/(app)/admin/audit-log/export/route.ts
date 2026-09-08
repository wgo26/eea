import { assertCapability } from '@/lib/admin/auth'
import { createAdminClient } from '@/lib/supabase/admin'

function csv(value: unknown): string {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export async function GET() {
  try {
    await assertCapability('viewAuditLog')
  } catch {
    return new Response('Forbidden', { status: 403 })
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode('id,action,entity_type,entity_id,actor_id,from_status,to_status,notes,created_at\n'))
      const client = createAdminClient()
      const pageSize = 500
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await client
          .from('moderation_log')
          .select('id, action, entity_type, entity_id, actor_id, from_status, to_status, notes, created_at')
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1)
        if (error) {
          controller.error(error)
          return
        }
        for (const row of data ?? []) {
          controller.enqueue(encoder.encode([
            row.id, row.action, row.entity_type, row.entity_id, row.actor_id,
            row.from_status, row.to_status, row.notes, row.created_at,
          ].map(csv).join(',') + '\n'))
        }
        if (!data || data.length < pageSize) break
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