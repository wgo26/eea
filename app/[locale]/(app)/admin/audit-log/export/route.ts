import { assertCapability } from '@/lib/admin/auth'
import { createAdminClient } from '@/lib/supabase/admin'

function csv(value: unknown): string {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export async function GET(request: Request) {
  try {
    await assertCapability('viewAuditLog')
  } catch {
    return new Response('Forbidden', { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || undefined
  const entityType = searchParams.get('entity') || undefined
  const from = searchParams.get('from') || undefined
  const to = searchParams.get('to') || undefined

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode('id,action,entity_type,entity_id,actor_id,from_status,to_status,notes,created_at\n'))
      const client = createAdminClient()
      const pageSize = 500
      for (let offset = 0; ; offset += pageSize) {
        let query = client
          .from('moderation_log')
          .select('id, action, entity_type, entity_id, actor_id, from_status, to_status, notes, created_at')
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1)
        if (action) query = query.eq('action', action)
        if (entityType) query = query.eq('entity_type', entityType)
        if (from) query = query.gte('created_at', from)
        if (to) query = query.lte('created_at', `${to}T23:59:59.999Z`)
        const { data, error } = await query
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