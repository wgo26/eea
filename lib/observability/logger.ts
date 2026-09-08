import "server-only";

/**
 * Phase 3.4 — Structured JSON logging + error tracking hook.
 *
 * Replaces raw `console.error` in server code (audit §5.2). Every line is a
 * single JSON object so log aggregators (Vercel, Datadog, CloudWatch) can
 * parse it: timestamp, level, scope, message, correlationId, plus optional
 * userId / clientIp / durationMs / extra fields.
 *
 * Error tracking: if `SENTRY_DSN` (or `NEXT_PUBLIC_SENTRY_DSN`) is set and a
 * Sentry SDK is installed, events are forwarded. The import is dynamic + best
 * effort so the app never crashes when Sentry is absent.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  correlationId?: string;
  userId?: string | null;
  clientIp?: string | null;
  route?: string | null;
  durationMs?: number | null;
  [key: string]: unknown;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '"[unserializable]"';
  }
}

function emit(level: LogLevel, scope: string, message: string, ctx: LogContext = {}): void {
  const { correlationId, userId, clientIp, route, durationMs, ...extra } = ctx;
  const record: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
    ...(correlationId ? { correlationId } : {}),
    ...(userId ? { userId } : {}),
    ...(clientIp ? { clientIp } : {}),
    ...(route ? { route } : {}),
    ...(typeof durationMs === "number" ? { durationMs } : {}),
  };
  // Keep `error` objects readable: serialize message + stack, not `{}`.
  if (extra.error instanceof Error) {
    record.error = { message: extra.error.message, stack: extra.error.stack };
    const { ...rest } = extra;
    delete rest.error;
    Object.assign(record, rest);
  } else if (Object.keys(extra).length > 0) {
    Object.assign(record, extra);
  }
  const line = safeStringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

async function reportToTracker(level: LogLevel, scope: string, message: string, ctx: LogContext): Promise<void> {
  if (level !== "error" && level !== "warn") return;
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  try {
    // Optional peer: only forwards when @sentry/nextjs is installed.
    // The non-literal specifier keeps TypeScript from requiring the package
    // at build time (import of a string-typed specifier resolves to `any`).
    const specifier: string = "@sentry/nextjs";
    const sentry = (await import(specifier).catch(() => null)) as {
      captureMessage?: (msg: string, opts?: unknown) => void;
      captureException?: (err: unknown) => void;
    } | null;
    if (!sentry) return;
    const err = (ctx as { error?: unknown }).error;
    if (err instanceof Error && sentry.captureException) sentry.captureException(err);
    else if (sentry.captureMessage) sentry.captureMessage(`[${scope}] ${message}`, { level: level === "error" ? "error" : "warning" });
  } catch {
    // Tracking must never break the request path.
  }
}

export const logger = {
  debug(scope: string, message: string, ctx: LogContext = {}): void {
    if (process.env.LOG_LEVEL === "debug") emit("debug", scope, message, ctx);
  },
  info(scope: string, message: string, ctx: LogContext = {}): void {
    emit("info", scope, message, ctx);
  },
  warn(scope: string, message: string, ctx: LogContext = {}): void {
    emit("warn", scope, message, ctx);
    void reportToTracker("warn", scope, message, ctx);
  },
  error(scope: string, message: string, ctx: LogContext & { error?: unknown } = {}): void {
    emit("error", scope, message, ctx);
    void reportToTracker("error", scope, message, ctx);
  },
};

/** Generates a short correlation id for tying logs to one request/job run. */
export function generateCorrelationId(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

/**
 * Times an async operation and logs completion/failure with durationMs.
 * Use in cron routes and query `safe()` wrappers.
 */
export async function withTimedLog<T>(
  scope: string,
  message: string,
  fn: () => Promise<T>,
  ctx: LogContext = {},
): Promise<T> {
  const start = Date.now();
  const correlationId = ctx.correlationId ?? generateCorrelationId();
  try {
    const result = await fn();
    logger.info(scope, message, { ...ctx, correlationId, durationMs: Date.now() - start });
    return result;
  } catch (error) {
    logger.error(scope, message, { ...ctx, correlationId, durationMs: Date.now() - start, error });
    throw error;
  }
}
