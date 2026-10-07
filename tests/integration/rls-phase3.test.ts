import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from 'pg'

/**
 * RLS behavioral invariants — live events, directory, billing, reviews.
 *
 * Covers every table phases 3–7 added: broadcasts are public to read and
 * staff-only to write; chat is publicly readable (visible rows) with
 * session-bound writes; RSVPs/claims/reviews follow the open-intake,
 * owner-or-staff-read model; money rows are private except to the payer and
 * staff. Mirrors the acting-user mechanics of rls.test.ts and self-skips
 * without RLS_TEST_DATABASE_URL.
 *
 * Seeds use ids disjoint from the other suites so files run in parallel.
 */

const CONNECTION_STRING = process.env.RLS_TEST_DATABASE_URL ?? ''
const suite = CONNECTION_STRING ? describe : describe.skip

const U = {
  staff: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  owner: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  stranger: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
} as const

const EVENT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const BIZ = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

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

suite('RLS invariants — live, directory, billing, reviews', () => {
  beforeAll(async () => {
    if (!CONNECTION_STRING) return
    client = new Client({ connectionString: CONNECTION_STRING })
    await client.connect()

    await client.query('begin')
    await client.query(
      `insert into auth.users (id, email) values
        ($1, 'p3staff@test.local'), ($2, 'p3owner@test.local'), ($3, 'p3stranger@test.local')
       on conflict (id) do nothing`,
      [U.staff, U.owner, U.stranger],
    )
    await client.query(
      `insert into public.profiles (id, display_name) values
        ($1, 'P3Staff'), ($2, 'P3Owner'), ($3, 'P3Stranger')
       on conflict (id) do update set display_name = excluded.display_name`,
      [U.staff, U.owner, U.stranger],
    )
    await client.query(
      `insert into public.user_roles (user_id, role) values ($1, 'admin')
       on conflict (user_id, role) do nothing`,
      [U.staff],
    )
    await client.query(
      `insert into public.content_items (id, type, slug, status) values
        ($1, 'culture', 'p3-event', 'published')
       on conflict (id) do nothing`,
      [EVENT],
    )
    await client.query(
      `insert into public.events (content_item_id, starts_at) values ($1, now() + interval '1 day')
       on conflict (content_item_id) do nothing`,
      [EVENT],
    )
    await client.query(
      `insert into public.businesses (id, owner_id, name, slug, status, is_verified)
       values ($1, $2, 'P3 Plumbing', 'p3-plumbing', 'active', true)
       on conflict (id) do nothing`,
      [BIZ, U.owner],
    )
    await client.query('commit')
  })

  afterAll(async () => {
    if (client) await client.end()
  })

  it('broadcasts are public to read, staff-only to write', async () => {
    await asUser('anon', null, async (c) => {
      expect(await count(c, `select count(*)::int n from public.event_broadcasts`)).toBe(0)
      await expect(
        c.query(`insert into public.event_broadcasts (content_item_id) values ($1)`, [EVENT]),
      ).rejects.toThrow()
    })
    await asUser('authenticated', U.stranger, async (c) => {
      await expect(
        c.query(`insert into public.event_broadcasts (content_item_id) values ($1)`, [EVENT]),
      ).rejects.toThrow()
    })
    await asUser('authenticated', U.staff, async (c) => {
      await c.query(`insert into public.event_broadcasts (content_item_id) values ($1)`, [EVENT])
      expect(await count(c, `select count(*)::int n from public.event_broadcasts`)).toBeGreaterThan(0)
    })
  })

  it('chat: visible rows public; writes are session-bound; hidden rows staff-only', async () => {
    const broadcastId = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    await asUser('authenticated', U.staff, async (c) => {
      // One broadcast per event (unique content_item_id): reset the fixture.
      await c.query(`delete from public.event_broadcasts where content_item_id = $1`, [EVENT])
      await c.query(
        `insert into public.event_broadcasts (id, content_item_id, status) values ($1, $2, 'live')`,
        [broadcastId, EVENT],
      )
    })
    // Stranger posts as themselves: ok. Posting as someone else: denied.
    await asUser('authenticated', U.stranger, async (c) => {
      await c.query(`insert into public.event_broadcast_chats (broadcast_id, user_id, body) values ($1, $2, 'hello')`, [
        broadcastId,
        U.stranger,
      ])
      await expect(
        c.query(`insert into public.event_broadcast_chats (broadcast_id, user_id, body) values ($1, $2, 'spoof')`, [
          broadcastId,
          U.owner,
        ]),
      ).rejects.toThrow()
    })
    // Hide one row as staff; anon sees only the visible one.
    await asUser('authenticated', U.staff, async (c) => {
      await c.query(
        `update public.event_broadcast_chats set is_hidden = true where broadcast_id = $1 and user_id = $2`,
        [broadcastId, U.stranger],
      )
    })
    await asUser('anon', null, async (c) => {
      expect(
        await count(c, `select count(*)::int n from public.event_broadcast_chats where broadcast_id = $1`, [broadcastId]),
      ).toBe(0)
    })
    await asUser('authenticated', U.stranger, async (c) => {
      expect(
        await count(c, `select count(*)::int n from public.event_broadcast_chats where broadcast_id = $1`, [broadcastId]),
      ).toBe(0)
    })
  })

  it('rsvps: owners manage own rows; nobody reads the roll', async () => {
    await asUser('anon', null, async (c) => {
      expect(await count(c, `select count(*)::int n from public.event_rsvps`)).toBe(0)
      await expect(
        c.query(`insert into public.event_rsvps (user_id, content_item_id) values ($1, $2)`, [U.stranger, EVENT]),
      ).rejects.toThrow()
    })
    await asUser('authenticated', U.stranger, async (c) => {
      await c.query(`insert into public.event_rsvps (user_id, content_item_id) values ($1, $2)
        on conflict do nothing`, [U.stranger, EVENT])
      expect(
        await count(c, `select count(*)::int n from public.event_rsvps where user_id = $1`, [U.stranger]),
      ).toBe(1)
      // Another user's rows stay invisible.
      expect(
        await count(c, `select count(*)::int n from public.event_rsvps where user_id = $1`, [U.owner]),
      ).toBe(0)
    })
  })

  it('claims: open intake, owner-or-staff reads', async () => {
    const claimId = '11111111-2222-4333-8444-555555555555'
    await asUser('anon', null, async (c) => {
      await c.query(
        `insert into public.business_claims (id, business_name, claimant_name) values ($1, 'Anon Biz', 'Anon')
         on conflict (id) do nothing`,
        [claimId],
      )
      expect(await count(c, `select count(*)::int n from public.business_claims`)).toBe(0)
    })
    await asUser('authenticated', U.staff, async (c) => {
      expect(await count(c, `select count(*)::int n from public.business_claims`)).toBeGreaterThan(0)
    })
  })

  it('money rows: payer + staff only', async () => {
    const ref = 'EEA-P3TEST-1'
    await asUser('authenticated', U.staff, async (c) => {
      await c.query(
        `insert into public.professional_subscriptions
           (business_id, plan_id, amount_xaf, days, status, reference, created_by)
         values ($1, 'pro_weekly', 1000, 7, 'pending', $2, $3)
         on conflict (reference) do nothing`,
        [BIZ, ref, U.owner],
      )
    })
    await asUser('authenticated', U.owner, async (c) => {
      expect(
        await count(c, `select count(*)::int n from public.professional_subscriptions`),
      ).toBeGreaterThan(0)
    })
    await asUser('authenticated', U.stranger, async (c) => {
      expect(await count(c, `select count(*)::int n from public.professional_subscriptions`)).toBe(0)
      await expect(
        c.query(`insert into public.professional_subscriptions
          (business_id, plan_id, amount_xaf, days, status, reference) values ($1, 'pro_weekly', 1000, 7, 'pending', 'EEA-P3TEST-2')`, [BIZ]),
      ).rejects.toThrow()
    })
    await asUser('anon', null, async (c) => {
      expect(await count(c, `select count(*)::int n from public.listing_promotions`)).toBe(0)
    })
  })

  it('reviews: open intake, approved-only public reads, staff adjudication', async () => {
    await asUser('anon', null, async (c) => {
      await c.query(
        `insert into public.business_reviews (business_id, reviewer_name, rating, body)
         values ($1, 'Anon Fan', 5, 'Great work, very professional.')`,
        [BIZ],
      )
      // Pending rows are invisible to the public.
      expect(
        await count(c, `select count(*)::int n from public.business_reviews where business_id = $1`, [BIZ]),
      ).toBe(0)
      await expect(
        c.query(`update public.business_reviews set status = 'approved' where business_id = $1`, [BIZ]),
      ).rejects.toThrow()
    })
    await asUser('authenticated', U.staff, async (c) => {
      await c.query(`update public.business_reviews set status = 'approved' where business_id = $1`, [BIZ])
    })
    await asUser('anon', null, async (c) => {
      expect(
        await count(c, `select count(*)::int n from public.business_reviews where business_id = $1`, [BIZ]),
      ).toBeGreaterThan(0)
    })
  })
})
