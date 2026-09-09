'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { importPosts, type ImportPostType } from '@/lib/admin/actions-import'
import { xmlFilesFromZip } from '@/lib/admin/zip-reader'
import { localePath } from '@/lib/i18n/urls'
import type { Dictionary, Locale } from '@/lib/i18n'
import { ui } from '@/lib/admin/ui-constants'

type Copy = Dictionary['admin']['content']
type TypeFilters = Dictionary['admin']['typeFilters']

type PreviewPost = {
  key: string
  title: string
  bodyHtml: string
  publishedAt: string | null
  labels: string[]
  originalUrl: string | null
  imageCount: number
}

function fill(template: string, n: number): string {
  return template.replace('{n}', String(n))
}

/**
 * Content import client (Blogger/Atom-style exports, .xml or .zip). Parsing
 * happens in the browser with DOMParser (mirrors lib/admin/blogger.ts: only
 * kind#post entries): the raw file never goes through a Server Action, so
 * large backups don't hit action body limits. ZIP archives are unpacked here
 * too (lib/admin/zip-reader.ts) and every .xml inside is parsed. Only the
 * selected posts' JSON is sent, in batches of 10.
 */
export function ContentImportClient({
  copy,
  typeFilters,
  locale,
}: {
  copy: Copy
  typeFilters: TypeFilters
  locale: Locale
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [parsing, setParsing] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [posts, setPosts] = useState<PreviewPost[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importType, setImportType] = useState<ImportPostType>('news')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [failures, setFailures] = useState<{ title: string; error: string }[]>([])

  const selectedPosts = useMemo(() => posts.filter((p) => selected.has(p.key)), [posts, selected])
  const allSelected = posts.length > 0 && selected.size === posts.length

  function parseFeed(doc: XMLDocument): PreviewPost[] {
    const out: PreviewPost[] = []
    const entries = doc.getElementsByTagName('entry')
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      const cats = entry.getElementsByTagName('category')
      let isPost = false
      const labels: string[] = []
      for (let c = 0; c < cats.length; c++) {
        const term = cats[c].getAttribute('term') ?? ''
        if (term.includes('kind#post')) isPost = true
        else if ((cats[c].getAttribute('scheme') ?? '').includes('blogger.com/atom/ns') && term) {
          labels.push(term)
        }
      }
      if (!isPost) continue

      const text = (tag: string): string | null => {
        const el = entry.getElementsByTagName(tag)[0]
        const v = el?.textContent?.trim()
        return v || null
      }
      const titleRaw = text('title')
      const contentEl = entry.getElementsByTagName('content')[0]
      const bodyHtml = contentEl?.textContent?.trim() ?? ''
      if (!bodyHtml) continue
      const plain = bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      const title = titleRaw || plain.split(' ').slice(0, 8).join(' ') || 'Untitled import'

      let originalUrl: string | null = null
      const links = entry.getElementsByTagName('link')
      for (let l = 0; l < links.length; l++) {
        if (links[l].getAttribute('rel') === 'alternate') {
          originalUrl = links[l].getAttribute('href')
          break
        }
      }
      const publishedRaw = text('published')
      const publishedAt = publishedRaw && !Number.isNaN(Date.parse(publishedRaw)) ? publishedRaw : null
      const imageCount = (bodyHtml.match(/<img\b[^>]*\bsrc=["']https?:\/\//gi) ?? []).length
      const id = text('id') ?? originalUrl ?? `${title}-${i}`
      out.push({ key: id, title, bodyHtml, publishedAt, labels, originalUrl, imageCount })
    }
    return out
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    setParsing(true)
    setFileError(null)
    setPosts([])
    setSelected(new Set())
    setDone(null)
    setFailures([])
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error('File too large (max 100 MB).')

      // ZIP archives (e.g. a Blogger backup download) are unpacked in the
      // browser and every .xml inside is parsed; plain .xml files parse as-is.
      // Detection is by extension OR the PK magic bytes, so mislabeled files
      // still work.
      const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
      const isZip =
        /\.zip$/i.test(file.name) ||
        (head[0] === 0x50 && head[1] === 0x4b && (head[2] === 3 || head[2] === 5 || head[2] === 7))

      let docs: string[]
      if (isZip) {
        let xmlFiles: { name: string; xml: string }[]
        try {
          xmlFiles = await xmlFilesFromZip(await file.arrayBuffer())
        } catch {
          throw new Error(copy.importBadZip)
        }
        if (xmlFiles.length === 0) throw new Error(copy.importNoPosts)
        docs = xmlFiles.map((f) => f.xml)
      } else {
        docs = [await file.text()]
      }

      // With a ZIP (multiple docs) unparsable entries are skipped; a single
      // plain file still fails loudly like before.
      const parser = new DOMParser()
      const parsed: PreviewPost[] = []
      for (const xml of docs) {
        const doc = parser.parseFromString(xml, 'text/xml')
        if (doc.getElementsByTagName('parsererror').length > 0) {
          if (docs.length === 1) throw new Error('Could not parse this XML file.')
          continue
        }
        parsed.push(...parseFeed(doc))
      }
      setPosts(parsed)
      setSelected(new Set(parsed.map((p) => p.key)))
      if (parsed.length === 0) setFileError(copy.importNoPosts)
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'Could not read this file.')
    } finally {
      setParsing(false)
    }
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleImport() {
    if (selectedPosts.length === 0 || importing) return
    setImporting(true)
    setProgress(null)
    setDone(null)
    setFailures([])
    const failed: { title: string; error: string }[] = []
    let imported = 0
    try {
      for (let i = 0; i < selectedPosts.length; i += 10) {
        const batch = selectedPosts.slice(i, i + 10).map((p) => ({
          title: p.title,
          bodyHtml: p.bodyHtml,
          publishedAt: p.publishedAt,
          labels: p.labels,
          originalUrl: p.originalUrl,
        }))
        setProgress(`${i + 1}–${Math.min(i + batch.length, selectedPosts.length)} / ${selectedPosts.length}`)
        const res = await importPosts(batch, importType)
        imported += res.imported.length
        failed.push(...res.failed)
      }
      setDone(fill(copy.importDone, imported))
      if (failed.length > 0) setFailures(failed)
      // Remove successfully imported rows from the preview so a retry only
      // re-sends failures (re-importing the same file would duplicate).
      if (failed.length === 0) {
        setPosts([])
        setSelected(new Set())
      } else {
        const failedTitles = new Set(failed.map((f) => f.title))
        const remaining = posts.filter((p) => failedTitles.has(p.title))
        setPosts(remaining)
        setSelected(new Set(remaining.map((p) => p.key)))
      }
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setImporting(false)
      setProgress(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <label className="text-sm font-medium">{copy.importFileLabel}</label>
        <p className="mt-1 text-xs text-muted-foreground">{copy.importFileHint}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xml,.atom,.zip,text/xml,application/atom+xml,application/zip"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button type="button" onClick={() => fileRef.current?.click()} className={ui.btnSecondary} disabled={parsing}>
            {parsing ? copy.importParsing : copy.importChooseFile}
          </button>
          {posts.length > 0 && (
            <span className="text-sm text-muted-foreground">{fill(copy.importFound, posts.length)}</span>
          )}
        </div>
        {fileError && <p className="mt-2 text-sm text-destructive">{fileError}</p>}
      </div>

      {posts.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => (allSelected ? setSelected(new Set()) : setSelected(new Set(posts.map((p) => p.key))))}
              className={ui.btnSecondary}
            >
              {allSelected ? copy.importClear : copy.importSelectAll}
            </button>
            <span className="text-sm text-muted-foreground">{fill(copy.importSelected, selected.size)}</span>
            <label className="ml-auto flex items-center gap-2 text-sm">
              {copy.importTypeLabel}
              <select
                value={importType}
                onChange={(e) => setImportType(e.target.value as ImportPostType)}
                className={ui.input}
              >
                {(['news', 'photo_story', 'culture', 'notice'] as const).map((t) => (
                  <option key={t} value={t}>
                    {typeFilters[t === 'photo_story' ? 'photoStory' : t as keyof TypeFilters] ?? t}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="w-10 p-3" aria-label="select" />
                  <th className="p-3 font-medium">{copy.importColTitle}</th>
                  <th className="p-3 font-medium">{copy.importColDate}</th>
                  <th className="p-3 font-medium">{copy.importColLabels}</th>
                  <th className="p-3 text-right font-medium">{copy.importColImages}</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.key} className="border-b border-border last:border-0">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selected.has(p.key)}
                        onChange={() => toggle(p.key)}
                        aria-label={p.title}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="max-w-[320px] truncate p-3 font-medium">{p.title}</td>
                    <td className="whitespace-nowrap p-3 text-muted-foreground">
                      {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString(locale) : '—'}
                    </td>
                    <td className="max-w-[220px] truncate p-3 text-muted-foreground">{p.labels.join(', ') || '—'}</td>
                    <td className="p-3 text-right text-muted-foreground">{p.imageCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || selected.size === 0}
              className={ui.btnPrimary}
            >
              {importing ? `${copy.importWorking}${progress ? ` (${progress})` : ''}` : copy.importStart}
            </button>
            <Link href={localePath(locale, '/admin/content')} className={ui.btnSecondary}>
              {copy.importBack}
            </Link>
          </div>
        </>
      )}

      {done && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">{done}</p>
          <Link href={localePath(locale, '/admin/content?status=draft')} className="mt-2 inline-block text-sm underline">
            {copy.importBack}
          </Link>
        </div>
      )}
      {failures.length > 0 && (
        <div className="rounded-lg border border-destructive/40 p-4">
          <p className="text-sm font-medium text-destructive">{fill(copy.importFailed, failures.length)}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {failures.map((f, i) => (
              <li key={`${f.title}-${i}`}>
                <span className="font-medium">{f.title}</span> — {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
