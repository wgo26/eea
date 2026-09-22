import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Unit tests for the proxy contract — regression net for audit D1/W1:
 *  - legacy_redirects exact matches are consulted BEFORE the asset-like
 *    exemption, because every Blogger-era path (/YYYY/MM/slug.html) ends in
 *    an extension and would otherwise 404 instead of reaching its canonical
 *    localized home;
 *  - legacy moves are permanent (308, method-preserving), not 307;
 *  - the locale 307 redirect, exemptions and x-locale header are unchanged.
 *
 * The Supabase client (legacy table source) and updateSession are mocked;
 * each test re-imports the module so the 5-minute TTL cache starts empty.
 */

const hoisted = vi.hoisted(() => ({
    table: new Map<string, string>(),
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({
        from: () => ({
            select: () =>
                Promise.resolve({
                    data: [...hoisted.table.entries()].map(([from_path, to_path]) => ({
                        from_path,
                        to_path,
                    })),
                    error: null,
                }),
        }),
    }),
}))

vi.mock('@/lib/supabase/middleware', () => ({
    updateSession: async () => {
        const { NextResponse } = await import('next/server')
        return NextResponse.next()
    },
}))

async function importProxy() {
    vi.resetModules()
    return await import('../../proxy')
}

function makeRequest(path: string, cookieLocale?: string): NextRequest {
    const req = new NextRequest(`http://localhost${path}`)
    if (cookieLocale) req.cookies.set('eea-locale', cookieLocale)
    return req
}

describe('proxy — legacy redirects (D1/W1)', () => {
    beforeEach(() => {
        hoisted.table.clear()
        hoisted.table.set('/2024/05/old-post.html', '/news/old-post')
    })

    it('308-redirects a Blogger .html path to the locale-prefixed canonical, before the asset exemption', async () => {
        const { proxy } = await importProxy()
        const res = await proxy(makeRequest('/2024/05/old-post.html'))
        expect(res.status).toBe(308)
        expect(res.headers.get('location')).toBe('http://localhost/en/news/old-post')
    })

    it('honors the eea-locale cookie when redirecting a legacy path', async () => {
        const { proxy } = await importProxy()
        const res = await proxy(makeRequest('/2024/05/old-post.html', 'fr'))
        expect(res.status).toBe(308)
        expect(res.headers.get('location')).toBe('http://localhost/fr/news/old-post')
    })

    it('persists the negotiated locale on a first-visit legacy redirect', async () => {
        const { proxy } = await importProxy()
        const res = await proxy(makeRequest('/2024/05/old-post.html'))
        expect(res.headers.get('set-cookie') ?? '').toContain('eea-locale=en')
    })

    it('passes asset-like paths through untouched when they have no legacy entry', async () => {
        const { proxy } = await importProxy()
        const res = await proxy(makeRequest('/downloads/file.pdf'))
        expect(res.status).toBe(200)
        expect(res.headers.get('location')).toBeNull()
        expect(res.headers.get('x-locale')).toBe('en')
    })
})

describe('proxy — locale contract unchanged', () => {
    beforeEach(() => {
        hoisted.table.clear()
    })

    it('307-redirects unprefixed paths to the negotiated locale', async () => {
        const { proxy } = await importProxy()
        const res = await proxy(makeRequest('/news'))
        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toBe('http://localhost/en/news')
    })

    it('leaves locale-prefixed paths alone and stamps x-locale', async () => {
        const { proxy } = await importProxy()
        const res = await proxy(makeRequest('/fr/news'))
        expect(res.status).toBe(200)
        expect(res.headers.get('x-locale')).toBe('fr')
    })

    it('never redirects /api/*', async () => {
        const { proxy } = await importProxy()
        const res = await proxy(makeRequest('/api/health'))
        expect(res.status).toBe(200)
        expect(res.headers.get('location')).toBeNull()
    })
})
