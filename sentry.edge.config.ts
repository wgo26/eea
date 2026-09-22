import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Production: ~10% of transactions traced — balances error-correlation
  // signal, Sentry cost, and main-thread overhead on the low-end Android
  // devices this product targets. In dev/preview we trace everything.
  tracesSampler: (context) => {
    if (process.env.NODE_ENV !== "production") return 1.0;
    return 0.1;
  },

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});
