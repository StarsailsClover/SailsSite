param(
  [string]$RepoPath = "C:\Users\Sails\Documents\WorkandLife\StarsailsClover"
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path $RepoPath).Path
$owner = "StarsailsClover"
$name = "SailsSite"
$apiBase = "repos/$owner/$name"
$parentSha = $null
try {
  $currentRef = gh api "$apiBase/git/ref/heads/main" | ConvertFrom-Json
  $parentSha = $currentRef.object.sha
} catch {
  $parentSha = $null
}
$readme = @"
# SailsSite

Dynamic personal website and writing studio for [sails.oxygenai.top](https://sails.oxygenai.top).

## Stack

- React, Vite, React Three Fiber
- Node.js HTTP API
- SQLite via ``node:sqlite``
- Nginx and systemd on LAX

## Development

```bash
npm ci
npm run check
npm run lint
npm run test:server
npm run build
```

Deployment notes are in [``deploy/lax/README.zh.md``](deploy/lax/README.zh.md).
"@

$includeTop = @(
  ".gitignore",
  ".env.example",
  "CNAME",
  "eslint.config.js",
  "index.html",
  "package-lock.json",
  "package.json",
  "postcss.config.js",
  "tailwind.config.js",
  "tsconfig.json",
  "vite.config.ts"
)
$includeDirs = @("server", "src", "public", "deploy", "_devdocs")
$excludedNames = @("node_modules", "dist", ".git", "_backups", "data")

$files = Get-ChildItem -LiteralPath $repo -Recurse -File | Where-Object {
  $relative = $_.FullName.Substring($repo.Length).TrimStart("\", "/")
  $parts = $relative -split '[\\/]'
  $excluded = $parts | Where-Object { $_ -in $excludedNames }
  $included = $parts[0] -in $includeDirs -or $relative -in $includeTop
  $workflow = $relative -eq ".github\workflows\ci.yml"
  $file = $_
  -not $excluded -and
  ($included -or $workflow) -and
  $file.Extension -ne ".mp3" -and
  $relative -ne "README.md"
}

$entries = New-Object System.Collections.Generic.List[object]
$index = 0
foreach ($file in $files) {
  $index++
  $relative = $file.FullName.Substring($repo.Length).TrimStart("\", "/").Replace("\", "/")
  $bytes = [IO.File]::ReadAllBytes($file.FullName)
  $payload = @{
    content = [Convert]::ToBase64String($bytes)
    encoding = "base64"
  } | ConvertTo-Json -Compress
  $blob = $payload | gh api "$apiBase/git/blobs" --method POST --input - | ConvertFrom-Json
  $entries.Add(@{
    path = $relative
    mode = "100644"
    type = "blob"
    sha = $blob.sha
  })
  if ($index % 20 -eq 0 -or $index -eq $files.Count) {
    Write-Host "uploaded $index/$($files.Count)"
  }
}

$readmePayload = @{
  content = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($readme))
  encoding = "base64"
} | ConvertTo-Json -Compress
$readmeBlob = $readmePayload | gh api "$apiBase/git/blobs" --method POST --input - | ConvertFrom-Json
$entries.Add(@{
  path = "README.md"
  mode = "100644"
  type = "blob"
  sha = $readmeBlob.sha
})

$treePayload = @{ tree = $entries } | ConvertTo-Json -Depth 8 -Compress
$tree = $treePayload | gh api "$apiBase/git/trees" --method POST --input - | ConvertFrom-Json
$parents = @()
if ($parentSha) {
  $parents = @($parentSha)
}
$commitPayload = @{
  message = "feat: initial dynamic SailsSite"
  tree = $tree.sha
  parents = $parents
  author = @{
    name = "StarsailsClover"
    email = "140955561+StarsailsClover@users.noreply.github.com"
  }
  committer = @{
    name = "StarsailsClover"
    email = "140955561+StarsailsClover@users.noreply.github.com"
  }
} | ConvertTo-Json -Depth 8 -Compress
$commit = $commitPayload | gh api "$apiBase/git/commits" --method POST --input - | ConvertFrom-Json

try {
  $refPayload = @{ ref = "refs/heads/main"; sha = $commit.sha } | ConvertTo-Json -Compress
  $refPayload | gh api "$apiBase/git/refs" --method POST --input - | Out-Null
} catch {
  $refPayload = @{ sha = $commit.sha; force = $false } | ConvertTo-Json -Compress
  $refPayload | gh api "$apiBase/git/refs/heads/main" --method PATCH --input - | Out-Null
}

Write-Host "commit=$($commit.sha)"
