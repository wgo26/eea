import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // P3: link errors to deploys. The host sets APP_VERSION at build/deploy
  // time (see .env.example); unset keeps Sentry's default release behavior.
  release: process.env.NEXT_PUBLIC_APP_VERSION || process.env.APP_VERSION || undefined,

  // Production: ~10% of transactions traced — balances error-correlation
  // signal, Sentry cost, and main-thread overhead on the low-end Android
  // devices this product targets. In dev/preview we trace everything.
  // Errors inherit the sampling decision of their parent transaction, so
  // error fidelity is unaffected at this rate.
  tracesSampler: (context) => {
    if (process.env.NODE_ENV !== "production") return 1.0;
    return 0.1;
  },

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});
