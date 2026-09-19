$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$root = 'c:\Users\Fame\apps\eea'
Write-Output '=== top-level entries under c:\Users\Fame\apps\eea ==='
Get-ChildItem -LiteralPath $root -Force | ForEach-Object Name

Write-Output ''
Write-Output '=== directories under eea (top 3 levels, relative) ==='
Get-ChildItem -LiteralPath $root -Recurse -Directory -Force -ErrorAction SilentlyContinue |
  ForEach-Object { $_.FullName.Substring($root.Length + 1) } |
  ForEach-Object { ($_.Split('\\') | Select-Object -First 3) -join '\\' } |
  Sort-Object -Unique |
  Select-Object -First 400

Write-Output ''
Write-Output '=== app-relative paths for app.ts/globals.css/runtime.js/x.svg ==='
$needles = @(
  'app.ts', 'globals.css', 'runtime.js', 'x.svg',
  '[locale]', '[locale]\[app]', '[locale]\[app]\[group]', '[locale]\[app]\[group]\[group]',
  '[locale]\[app]\[group]\about\loading.(group).svg',
  '[locale]\[app]\[group]\[group]\about', 'loading.light.svg'
)
Get-ChildItem -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue |
  ForEach-Object { $_.FullName.Substring($root.Length + 1) } |
  Where-Object {
    $_ -match '(^|\\)app\.ts$' -or
    $_ -match '(^|\\)globals\.css$' -or
    $_ -match '(^|\\)runtime\.js$' -or
    $_ -match '(^|\\)x\.svg$' -or
    $_ -match '(^|\\)\[locale\]\\(app)\\[^\\]*$' -or
    $_ -match 'loading\.(light|dark|group)\.svg$'
  } |
  Sort-Object |
  Select-Object -First 200

Write-Output ''
Write-Output '=== app.ts/globals.css/runtime.js/x.svg full paths (both drives) ==='
$hits = @()
foreach ($drive in @('c:', 'd:')) {
  if (-not (Test-Path -LiteralPath ($drive + '\'))) { continue }
  Get-ChildItem -LiteralPath ($drive + '\') -Recurse -Force -ErrorAction SilentlyContinue -Buffer 5000 |
    Where-Object { -not $_.PSIsContainer -and $_.Name -in @('app.ts', 'globals.css', 'runtime.js', 'x.svg') } |
    ForEach-Object { $hits += $_.FullName }
}
$hits | Sort-Object | Select-Object -First 200

Write-Output ''
Write-Output '=== package.json excludes/copy scripts ==='
$pkgPath = Join-Path $root 'package.json'
if (Test-Path -LiteralPath $pkgPath) {
  $p = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
  if ($p.files) { Write-Output ('files: ' + ($p.files -join ', ')) }
  if ($p.exclude) { Write-Output ('exclude: ' + ($p.exclude -join ', ')) }
  if ($p.publishConfig) { Write-Output ('publishConfig: ' + ($p.publishConfig | ConvertTo-Json -Compress)) }
}
