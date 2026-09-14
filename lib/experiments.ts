'use client'

import { useSyncExternalStore } from 'react'

/**
 * Minimal experiment framework: deterministic 50/50 bucketing (FNV-1a hash
 * over experiment + seed), sticky per browser via localStorage.
 *
 * Scope note: this is assignment only — there is no metrics/analysis
 * pipeline. Use it for low-risk UX variants (order, copy emphasis), never
 * for anything that changes what content a user can access. The registry
 * below is the single list of running experiments.
 */

export const EXPERIMENTS = {
  /** Article action-row order: share-first (control) vs save-first. */
  'action-row-order': ['share-first', 'save-first'],
} as const

export type ExperimentName = keyof typeof EXPERIMENTS
export type ExperimentVariant<N extends ExperimentName> = (typeof EXPERIMENTS)[N][number]

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

export function bucketVariant<N extends ExperimentName>(name: N, seed: string): ExperimentVariant<N> {
  const variants = EXPERIMENTS[name]
  return variants[hashSeed(`${name}:${seed}`) % variants.length] as ExperimentVariant<N>
}

const keyFor = (name: string) => `eea-exp:${name}`
const listeners = new Set<() => void>()

function readVariant<N extends ExperimentName>(name: N): ExperimentVariant<N> {
  try {
    const stored = localStorage.getItem(keyFor(name))
    if (stored && (EXPERIMENTS[name] as readonly string[]).includes(stored)) {
      return stored as ExperimentVariant<N>
    }
    const assigned = bucketVariant(name, Math.random().toString(36).slice(2))
    try {
      localStorage.setItem(keyFor(name), assigned)
    } catch {
      /* session-only */
    }
    return assigned
  } catch {
    return bucketVariant(name, 'server')
  }
}

/** Sticky client-side variant for a running experiment. */
export function useExperiment<N extends ExperimentName>(name: N): ExperimentVariant<N> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => readVariant(name),
    () => EXPERIMENTS[name][0],
  )
}
