import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from 'pg'

/**
 * RLS behavioral invariants — RBAC core (audit W3/D3).
 *
 * The defense-in-depth chain is page guards → capability-gated Server Actions
 * → RLS. The first two layers were covered by tests; the RLS layer — the one
 * that actually contains a future policy drift — previously had ZERO coverage
 * (this file and rls-phase2.test.ts were permanent `it.skip` placeholders).
 *
 * Schema comes from `scripts/rls-harness.mjs` (Supabase-equivalent stubs +
 * every real migration in order). Acting-user simulation mirrors Supabase
 * semantics: the harness stubs auth.uid() to read `request.jwt.claim.sub`, so
 * `asUser()` sets that GUC and SETs LOCAL ROLE inside a transaction that
 * always rolls back.
 *
 * Self-skips without RLS_TEST_DATABASE_URL so `npm test` stays green locally;
 * CI runs it blocking in the `rls-invariants` job (postgres:16 service).
 */

const CONNECTION_STRING = process.env.RLS_TEST_DATABASE_URL ?? ''
const suite = CONNECTION_STRING ? describe : describe.skip

const U = {
  admin: '11111111-1111-4111-8111-111111111111',
  editor: '22222222-2222-4222-8222-222222222222',
  member: '33333333-3333-4333-8333-333333333333',
  hidden: '66666666-6666-4666-8666-666666666666',
} as const

let client: Client

/** Runs `fn` as `role` (optionally as a specific user id) inside a rollback transaction. */
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

suite('RLS invariants — RBAC core', () => {
  beforeAll(async () => {
    if (!CONNECTION_STRING) return
    client = new Client({ connectionString: CONNECTION_STRING })
    await client.connect()

    // Seed as the harness superuser (bypasses RLS by design). Idempotent.
    await client.query('begin')
    await client.query(
      `insert into auth.users (id, email) values
         ($1, 'admin@test.local'), ($2, 'editor@test.local'),
         ($3, 'member@test.local'), ($4, 'hidden@test.local')
       on conflict (id) do nothing`,
      [U.admin, U.editor, U.member, U.hidden],
    )
    await client.query(
      `insert into public.profiles (id, display_name, is_public) values
         ($1, 'Admin', true), ($2, 'Editor', true), ($3, 'Member', true), ($4, 'Hidden', false)
       on conflict (id) do update set display_name = excluded.display_name, is_public = excluded.is_public`,
      [U.admin, U.editor, U.member, U.hidden],
    )
    await client.query(
      `insert into public.user_roles (user_id, role) values ($1, 'admin'), ($2, 'editor')
       on conflict (user_id, role) do nothing`,
      [U.admin, U.editor],
    )
    await client.query(
      `insert into public.content_items (type, slug, status, published_at, is_archived) values
         ('news', 'rls-published', 'published', now(), false),
         ('news', 'rls-draft',     'draft',     null, false),
         ('news', 'rls-archived',  'published', now(), true)
       on conflict (slug) do nothing`,
    )
    await client.query(
      `insert into public.content_translations (content_item_id, locale, title)
       select id, 'en', 'RLS seed story' from public.content_items where slug = 'rls-published'
       and not exists (
         select 1 from public.content_translations t where t.content_item_id = content_items.id
       )`,
    )
    await client.query(
      `insert into public.submissions (submission_type, submitted_by, payload)
       select 'news', p.id, '{"headline":"own submission"}'::jsonb
       from public.profiles p where p.id = $1
       and not exists (select 1 from public.submissions s where s.submitted_by = $1)`,
      [U.member],
    )
    await client.query(
      `insert into public.submissions (submission_type, payload, guest_email)
       select 'notice', '{"headline":"guest submission"}'::jsonb, 'guest@test.local'
       where not exists (
         select 1 from public.submissions s where s.guest_email = 'guest@test.local'
       )`,
    )
    await client.query(
      `insert into public.data_requests (requester_id, requester_email, request_type, description)
       select p.id, 'member@test.local', 'erasure', 'Remove my data'
       from public.profiles p where p.id = $1
       and not exists (select 1 from public.data_requests d where d.requester_id = $1)`,
      [U.member],
    )
    await client.query(
      `insert into public.data_requests (requester_email, request_type, description)
       select 'guest-req@test.local', 'access', 'Send me my data'
       where not exists (
         select 1 from public.data_requests d where d.requester_email = 'guest-req@test.local'
       )`,
    )
    await client.query('commit')
  })

  afterAll(async () => {
    if (client) await client.end()
  })

  it('anonymous visitors read only published, non-archived content', async () => {
    await asUser('anon', null, async (c) => {
      expect(
        await count(c, `select count(*)::int as n from public.content_items where slug = 'rls-published'`),
      ).toBe(1)
      // No draft or archived row ever leaks, regardless of what other seeds exist.
      expect(
        await count(
          c,
          `select count(*)::int as n from public.content_items where status <> 'published' or is_archived`,
        ),
      ).toBe(0)
      expect(
        await count(c, `select count(*)::int as n from public.content_items where slug = 'rls-draft'`),
      ).toBe(0)
      expect(
        await count(c, `select count(*)::int as n from public.content_items where slug = 'rls-archived'`),
      ).toBe(0)
    })
  })

  it('draft content is equally invisible to a signed-in member', async () => {
    await asUser('authenticated', U.member, async (c) => {
      expect(
        await count(
          c,
          `select count(*)::int as n from public.content_items where status <> 'published' or is_archived`,
        ),
      ).toBe(0)
    })
  })

  it('staff (editor) reads every content item including drafts and archived', async () => {
    await asUser('authenticated', U.editor, async (c) => {
      expect(
        await count(
          c,
          `select count(*)::int as n from public.content_items
           where slug in ('rls-published', 'rls-draft', 'rls-archived')`,
        ),
      ).toBe(3)
    })
  })

  it('submissions are invisible to anonymous visitors (guest rows have no owner)', async () => {
    await asUser('anon', null, async (c) => {
      expect(await count(c, 'select count(*)::int as n from public.submissions')).toBe(0)
    })
  })

  it('a member sees only their own submissions; an editor sees the full queue', async () => {
    await asUser('authenticated', U.member, async (c) => {
      expect(await count(c, 'select count(*)::int as n from public.submissions')).toBe(1)
    })
    await asUser('authenticated', U.editor, async (c) => {
      expect(await count(c, 'select count(*)::int as n from public.submissions')).toBe(2)
    })
  })

  it('user_roles: members see only their own (contributor) row; staff sees the full map; anon sees none', async () => {
    // handle_new_user auto-grants every new user the 'contributor' role, so a
    // member sees exactly one row — their own — and never the staff map.
    await asUser('authenticated', U.member, async (c) => {
      expect(await count(c, 'select count(*)::int as n from public.user_roles')).toBe(1)
      expect(
        await count(c, `select count(*)::int as n from public.user_roles where role in ('admin','editor')`),
      ).toBe(0)
      expect(
        await count(c, 'select count(*)::int as n from public.user_roles where user_id = $1', [U.editor]),
      ).toBe(0)
    })
    await asUser('authenticated', U.editor, async (c) => {
      expect(
        await count(c, `select count(*)::int as n from public.user_roles where role in ('admin','editor')`),
      ).toBe(2)
    })
    await asUser('anon', null, async (c) => {
      expect(await count(c, 'select count(*)::int as n from public.user_roles')).toBe(0)
    })
  })

  it('members cannot grant themselves a role (RLS with-check on user_roles)', async () => {
    await expect(
      asUser('authenticated', U.member, (c) =>
        c.query('insert into public.user_roles (user_id, role) values ($1, $2)', [
          U.member,
          'admin',
        ]),
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('profiles: members update only their own row; non-public profiles stay invisible', async () => {
    await asUser('authenticated', U.member, async (c) => {
      const own = await c.query('update public.profiles set display_name = $2 where id = $1', [
        U.member,
        'Member v2',
      ])
      expect(own.rowCount).toBe(1)

      const other = await c.query('update public.profiles set display_name = $2 where id = $1', [
        U.editor,
        'Hijacked',
      ])
      expect(other.rowCount).toBe(0)

      expect(
        await count(c, 'select count(*)::int as n from public.profiles where id = $1', [U.hidden]),
      ).toBe(0)
      expect(
        await count(c, 'select count(*)::int as n from public.profiles where id = $1', [U.editor]),
      ).toBe(1)
    })
  })

  it('data_requests: guest rows invisible to anon; members see only their own; staff sees all', async () => {
    await asUser('anon', null, async (c) => {
      expect(await count(c, 'select count(*)::int as n from public.data_requests')).toBe(0)
    })
    await asUser('authenticated', U.member, async (c) => {
      expect(await count(c, 'select count(*)::int as n from public.data_requests')).toBe(1)
    })
    await asUser('authenticated', U.editor, async (c) => {
      expect(await count(c, 'select count(*)::int as n from public.data_requests')).toBe(2)
    })
  })

  it('rate_limit_hits stays revoked from anon and authenticated (privilege backstop)', async () => {
    await expect(
      asUser('anon', null, (c) => c.query('select count(*) from public.rate_limit_hits')),
    ).rejects.toThrow(/permission denied/i)
    await expect(
      asUser('authenticated', U.member, (c) => c.query('select count(*) from public.rate_limit_hits')),
    ).rejects.toThrow(/permission denied/i)
  })

  it('the admin hard-delete RPC rejects an editor — editors cannot delete', async () => {
    await expect(
      asUser('authenticated', U.editor, (c) =>
        c.query(
          `select public.admin_delete_content_item(
             (select id from public.content_items where slug = 'rls-draft'), $1, 'rls-invariant test')`,
          [U.editor],
        ),
      ),
    ).rejects.toThrow(/admin permission required/i)
  })

  it('the admin hard-delete RPC succeeds for an admin and removes the item', async () => {
    await asUser('authenticated', U.admin, async (c) => {
      await c.query(
        `select public.admin_delete_content_item(
           (select id from public.content_items where slug = 'rls-draft'), $1, 'rls-invariant test')`,
        [U.admin],
      )
      expect(
        await count(c, `select count(*)::int as n from public.content_items where slug = 'rls-draft'`),
      ).toBe(0)
    })
  })
})
