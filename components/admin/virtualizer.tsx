'use client'

import { useEffect, useRef, useState } from 'react'

export type VirtualRow = {
  index: number
  start: number
  size: number
}

export type VirtualizerState = {
  virtualRows: VirtualRow[]
  totalHeight: number
  offset: number
}

/**
 * Minimal virtual-scroller for fixed-height table rows.
 * No external dependencies. Use the returned `measureRef` on the scroll
 * container div; the hook computes visible rows from scrollTop + clientHeight.
 */
export function useVirtualizer({
  total,
  itemHeight = 48,
  overscan = 5,
  enabled = true,
}: {
  total: number
  itemHeight?: number
  overscan?: number
  enabled?: boolean
}): [VirtualizerState, (node: HTMLElement | null) => void] {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [state, setState] = useState<VirtualizerState>({
    virtualRows: [],
    totalHeight: total * itemHeight,
    offset: 0,
  })

  useEffect(() => {
    if (!enabled) return
    const el = containerRef.current
    if (!el) return

    const update = () => {
      if (!containerRef.current) return
      const { scrollTop, clientHeight } = containerRef.current
      const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
      const endIdx = Math.min(
        total - 1,
        startIdx + Math.ceil(clientHeight / itemHeight) + overscan + 1,
      )

      const virtualRows: VirtualRow[] = []
      for (let i = startIdx; i <= endIdx; i++) {
        virtualRows.push({ index: i, start: i * itemHeight, size: itemHeight })
      }

      setState({
        virtualRows,
        totalHeight: total * itemHeight,
        offset: startIdx * itemHeight,
      })
    }

    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(() => update())
    ro.observe(el)

    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [total, itemHeight, overscan, enabled])

  const measureRef = (node: HTMLElement | null) => {
    containerRef.current = node instanceof HTMLDivElement ? node : null
    if (node instanceof HTMLDivElement) {
      const { scrollTop, clientHeight } = node
      const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
      const endIdx = Math.min(
        total - 1,
        startIdx + Math.ceil(clientHeight / itemHeight) + overscan + 1,
      )
      const virtualRows: VirtualRow[] = []
      for (let i = startIdx; i <= endIdx; i++) {
        virtualRows.push({ index: i, start: i * itemHeight, size: itemHeight })
      }
      setState({
        virtualRows,
        totalHeight: total * itemHeight,
        offset: startIdx * itemHeight,
      })
    }
  }

  return [state, measureRef]
}
