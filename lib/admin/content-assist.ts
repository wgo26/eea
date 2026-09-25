/**
 * Content smart-assist — compatibility barrel.
 *
 * The implementation now lives in the two modules named for what they do:
 *  - `@/lib/content/blocks`    the story-block document model (serialize /
 *                              parse / merge / insert), and
 *  - `@/lib/content/auto-fill` the deterministic field drafters (excerpt, SEO,
 *                              tags, slug, share line, category, location, alt).
 *
 * Both are domain modules under lib/content rather than admin-only helpers: the
 * public article pages consume the block markup, and the drafters belong to any
 * form that writes a post. This file remains as the path every existing import
 * already uses, so nothing downstream had to change; new code should import from
 * the canonical modules directly.
 */

export * from "@/lib/content/blocks";
export * from "@/lib/content/auto-fill";
