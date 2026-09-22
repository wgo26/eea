import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from 'pg'

/**
 * RLS behavioral invariants — community surfaces (audit W3/D3).
 *
 * Supersedes the previous live-credential placeholders (digest_subscribers /
 * notices column REVOKEs / user_roles): those invariants are now covered
 * deterministically against the ephemeral migration-built schema — no live
 * backend needed, no dummy-key heuristics.
 *
 * Schema + acting-user mechanics are documented in rls.test.ts; the suite
 * self-skips without RLS_TEST_DATABASE_URL and is CI-blocking.
 * Seeds use ids/slugs disjoint from rls.test.ts so both files can run in
 * parallel workers against the same ephemeral database.
 */

const CONNECTION_STRING = process.env.RLS_TEST_DATABASE_URL ?? ''
const suite = CONNECTION_STRING ? describe : describe.skip

const U = {
  buyer: '44444444-4444-4444-8444-444444444444',
  seller: '55555555-5555-4555-8555-555555555555',
  outsider: '77777777-7777-4777-8777-777777777777',
  saver2: '88888888-8888-4888-8888-888888888888',
} as const

let client: Client

async function asUser<T>(
  role: 'anon' | 'authenticated',
  userId: string | null,
  fn: (c: Client) => Promise<T>,
): Promise<T> {
  await client.query('begin')
  try {
    if (userId) {
      await client.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', userId])
    }
    await client.query(`set local role ${role}`)
    return await fn(client)
  } finally {
    await client.query('rollback')
  }
}

const count = async (c: Client, sql: string, params: unknown[] = []): Promise<number> => {
  const { rows } = await c.query<{ n: number }>(sql, params as never[])
  return rows[0].n
}

suite('RLS invariants — community surfaces', () => {
  beforeAll(async () => {
    if (!CONNECTION_STRING) return
    client = new Client({ connectionString: CONNECTION_STRING })
    await client.connect()

    await client.query('begin')
    await client.query(
      `insert into auth.users (id, email) values
         ($1, 'buyer@test.local'), ($2, 'seller@test.local'),
         ($3, 'outsider@test.local'), ($4, 'saver2@test.local')
       on conflict (id) do nothing`,
      [U.buyer, U.seller, U.outsider, U.saver2],
    )
    await client.query(
      `insert into public.profiles (id, display_name) values
         ($1, 'Buyer'), ($2, 'Seller'), ($3, 'Outsider'), ($4, 'Saver2')
       on conflict (id) do update set display_name = excluded.display_name`,
      [U.buyer, U.seller, U.outsider, U.saver2],
    )
    await client.query(
      `insert into public.content_items (type, slug, status, published_at, is_archived)
       values ('listing', 'rls-c-published', 'published', now(), false)
       on conflict (slug) do nothing`,
    )
    await client.query(
      `insert into public.content_translations (content_item_id, locale, title)
       select id, 'en', 'RLS community listing' from public.content_items where slug = 'rls-c-published'
       and not exists (
         select 1 from public.content_translations t where t.content_item_id = content_items.id
       )`,
    )
    await client.query(
      `insert into public.listing_conversations (content_item_id, buyer_id, seller_id)
       select ci.id, $1, $2 from public.content_items ci where ci.slug = 'rls-c-published'
       and not exists (
         select 1 from public.listing_conversations lc
         where lc.content_item_id = ci.id and lc.buyer_id = $1
       )`,
      [U.buyer, U.seller],
    )
    await client.query(
      `insert into public.price_watches (user_id, content_item_id)
       select $1, ci.id from public.content_items ci where ci.slug = 'rls-c-published'
       on conflict do nothing`,
      [U.buyer],
    )
    await client.query(
      `insert into public.saved_content (user_id, content_item_id)
       select $1, ci.id from public.content_items ci where ci.slug = 'rls-c-published'
       on conflict do nothing`,
      [U.saver2],
    )
    await client.query('commit')
  })

  afterAll(async () => {
    if (client) await client.end()
  })

  it('listing conversations are visible to buyer and seller, never to outsiders', async () => {
    await asUser('authenticated', U.buyer, async (c) => {
      expect(await count(c, 'select count(*)::int as n from public.listing_conversations')).toBe(1)
    })
    await asUser('authenticated', U.seller, async (c) => {
      expect(await count(c, 'select count(*)::int as n from public.listing_conversations')).toBe(1)
    })
    await asUser('authenticated', U.outsider, async (c) => {
      expect(await count(c, 'select count(*)::int as n from public.listing_conversations')).toBe(0)
    })
  })

  it('only participants can append messages, and only under their own sender_id', async () => {
    await asUser('authenticated', U.buyer, async (c) => {
      const ok = await c.query(
        `insert into public.listing_conversation_messages (conversation_id, sender_id, body)
         select lc.id, $1, 'Is this still available?'
         from public.listing_conversations lc
         join public.content_items ci on ci.id = lc.content_item_id and ci.slug = 'rls-c-published'`,
        [U.buyer],
      )
      expect(ok.rowCount).toBe(1)
    })
    // An outsider can neither see the conversation nor write into it: the
    // INSERT...SELECT sources from listing_conversations, which RLS empties
    // for non-participants — so the insert is a no-op, not an error.
    const outsider = await asUser('authenticated', U.outsider, (c) =>
      c.query(
        `insert into public.listing_conversation_messages (conversation_id, sender_id, body)
         select lc.id, $1, 'outsider should not write'
         from public.listing_conversations lc limit 1`,
        [U.outsider],
      ),
    )
    expect(outsider.rowCount).toBe(0)
    // A participant spoofing someone else's sender_id is rejected outright.
    await expect(
      asUser('authenticated', U.buyer, (c) =>
        c.query(
          `insert into public.listing_conversation_messages (conversation_id, sender_id, body)
           select lc.id, $1, 'sender spoof should not write'
           from public.listing_conversations lc limit 1`,
          [U.outsider],
        ),
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('price watches are owner-scoped: you see yours, never others', async () => {
    await asUser('authenticated', U.buyer, async (c) => {
      expect(await count(c, 'select count(*)::int as n from public.price_watches')).toBe(1)
    })
    await asUser('authenticated', U.outsider, async (c) => {
      expect(await count(c, 'select count(*)::int as n from public.price_watches')).toBe(0)
    })
    await expect(
      asUser('authenticated', U.outsider, (c) =>
        c.query(
          `insert into public.price_watches (user_id, content_item_id)
           select $1, ci.id from public.content_items ci where ci.slug = 'rls-c-published'`,
          [U.buyer], // trying to create a watch attributed to someone else
        ),
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('saved content is owner-scoped', async () => {
    await asUser('authenticated', U.buyer, async (c) => {
      const ins = await c.query(
        `insert into public.saved_content (user_id, content_item_id)
         select $1, ci.id from public.content_items ci where ci.slug = 'rls-c-published'`,
        [U.buyer],
      )
      expect(ins.rowCount).toBe(1)
      expect(await count(c, 'select count(*)::int as n from public.saved_content')).toBe(1)
      // Cannot see or remove someone else's saved rows.
      const del = await c.query('delete from public.saved_content where user_id = $1', [U.saver2])
      expect(del.rowCount).toBe(0)
    })
    await asUser('authenticated', U.saver2, async (c) => {
      expect(await count(c, 'select count(*)::int as n from public.saved_content')).toBe(1)
    })
  })

  it('reports: anyone may submit, only the reporter and staff can read', async () => {
    await asUser('anon', null, async (c) => {
      const ins = await c.query(
        `insert into public.reports (report_type, subject, description)
         values ('spam', 'rls-invariant', 'anonymous report')`,
      )
      expect(ins.rowCount).toBe(1)
      expect(await count(c, 'select count(*)::int as n from public.reports')).toBe(0)
    })
    await asUser('authenticated', U.buyer, async (c) => {
      await c.query(
        `insert into public.reports (report_type, subject, description, reporter_id)
         values ('abuse', 'rls-invariant', 'owned report', $1)`,
        [U.buyer],
      )
      expect(await count(c, 'select count(*)::int as n from public.reports')).toBe(1)
    })
    await asUser('authenticated', U.outsider, async (c) => {
      // A member with no staff role sees nothing of others' reports.
      expect(await count(c, 'select count(*)::int as n from public.reports')).toBe(0)
    })
  })

  it('corrections: anyone may submit, only staff can review', async () => {
    await asUser('anon', null, async (c) => {
      const ins = await c.query(
        `insert into public.corrections (content_item_id, correction_text)
         select ci.id, 'date should read 2026' from public.content_items ci
         where ci.slug = 'rls-c-published'`,
      )
      expect(ins.rowCount).toBe(1)
      expect(await count(c, 'select count(*)::int as n from public.corrections')).toBe(0)
    })
    await asUser('authenticated', U.buyer, async (c) => {
      expect(await count(c, 'select count(*)::int as n from public.corrections')).toBe(0)
    })
  })
})
