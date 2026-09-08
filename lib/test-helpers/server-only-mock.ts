/**
 * Test-only stand-in for the `server-only` package.
 *
 * Vitest executes in plain Node rather than inside React Server Components,
 * where the real `server-only` guard throws on import. This no-op keeps
 * server-module unit tests (actions, queries, storage) importable.
 * Production builds are unaffected — Next.js resolves the real package.
 */
export {};
