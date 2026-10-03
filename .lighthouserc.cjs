/**
 * Lighthouse CI budgets (docs/perf-budget.md) — the lab gate the performance
 * budget previously lacked ("no Lighthouse CI yet" is now history).
 *
 * Mobile emulation + simulated 4G (Lighthouse default) matches the Moto G
 * audience the budget is written for. Threshold philosophy:
 *
 *   warn  = the documented target (LCP < 2.5 s on 4G, perf >= 0.8 …) — a
 *           yellow run means "over budget, act before it turns red";
 *   error = the regression ceiling — a red run is launch-scale breakage.
 *
 * URLs come from env so the SAME config serves the weekly production job
 * (.github/workflows/lighthouse.yml, article URL resolved from the live
 * sitemap) and a local `npm run perf:lighthouse` against any base:
 *
 *   LHCI_BASE_URL      production origin (default https://eagleeyeafrica.org)
 *   LHCI_ARTICLE_URL   a real /en/news/[slug] URL (default: /en/about/guide)
 *   LHCI_NUM_RUNS      runs per URL (default 3 — median, per LHCI guidance)
 */
const base = (process.env.LHCI_BASE_URL || 'https://eagleeyeafrica.org').replace(/\/+$/, '');
const article = process.env.LHCI_ARTICLE_URL || `${base}/en/about/guide`;
const runs = Number(process.env.LHCI_NUM_RUNS || 3);

module.exports = {
  ci: {
    collect: {
      url: [`${base}/en`, `${base}/fr`, article],
      numberOfRuns: runs,
      settings: { preset: 'mobile' },
    },
    assert: {
      assertions: {
        // Docs target: LCP < 2.5 s on 4G. Ceiling: 5 s (red = regression).
        'largest-contentful-paint': [
          ['error', { maxNumericValue: 5000 }],
          ['warn', { maxNumericValue: 2500 }],
        ],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': [
          ['error', { maxNumericValue: 600 }],
          ['warn', { maxNumericValue: 300 }],
        ],
        // Scores: warn = target, error = floor.
        'categories:performance': [
          ['warn', { minScore: 0.8 }],
          ['error', { minScore: 0.6 }],
        ],
        'categories:accessibility': [
          ['warn', { minScore: 0.95 }],
          ['error', { minScore: 0.85 }],
        ],
        // Mobile payload: warn at ~1.5 MB transfer, error at 3 MB.
        'total-byte-weight': [
          ['warn', { maxNumericValue: 1_500_000 }],
          ['error', { maxNumericValue: 3_000_000 }],
        ],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci/reports' },
  },
};
