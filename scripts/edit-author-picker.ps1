$item = Get-ChildItem 'C:\Users\Fame\apps\eea\app' -Recurse -Filter 'content-dialogs.tsx' | Select-Object -First 1
$f = $item.FullName
Write-Host "File: $f"
$c = [System.IO.File]::ReadAllText($f)

$old = @'
      <Field label={copy.bylineLabel} hint={copy.bylineHint}>
        <input value={byline} onChange={(e) => setByline(e.target.value)} className={inputCls} />
      </Field>
'@

$new = @'
      <Field label={copy.bylineLabel} hint={copy.bylineHint}>
        <input value={byline} onChange={(e) => setByline(e.target.value)} className={inputCls} />
      </Field>
      <Field label={copy.authorLabel} hint={copy.authorHint}>
        <div className="relative">
          <div className={inputCls + ' flex items-center justify-between gap-2'}>
            <span className={authorName ? 'text-foreground' : 'text-muted-foreground'}>
              {authorName || copy.authorNone}
            </span>
            {authorId && (
              <button type="button" onClick={() => pickAuthor(null)} className="text-xs text-muted-foreground hover:text-foreground" title={copy.authorClear}>
                {copy.authorClear}
              </button>
            )}
          </div>
          <input
            value={authorQuery}
            onChange={(e) => { setAuthorQuery(e.target.value); setAuthorOpen(true) }}
            onFocus={() => setAuthorOpen(true)}
            placeholder={copy.authorSearchHint}
            className={inputCls + ' mt-2'}
          />
          {authorOpen && (authorQuery.trim() || authorResults.length > 0 || authorSearching) && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-auto rounded-md border border-border bg-background shadow-lg">
              {authorSearching && <div className="px-3 py-2 text-xs text-muted-foreground">{common.working}</div>}
              {!authorSearching && authorResults.length === 0 && authorQuery.trim() && (
                <div className="px-3 py-2 text-xs text-muted-foreground">{common.noResults}</div>
              )}
              {authorResults.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => pickAuthor(a)}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted"
                >
                  <span>{a.name}</span>
                  {a.id === authorId && <span className="text-xs text-primary">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </Field>
'@

if ($c.Contains($old)) {
    $c = $c.Replace($old, $new)
    [System.IO.File]::WriteAllText($f, $c)
    Write-Host "Replaced successfully"
} else {
    Write-Host "Old text not found!"
}
