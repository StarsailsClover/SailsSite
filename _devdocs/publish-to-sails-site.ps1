param(
  [string]$RepoPath = "C:\Users\Sails\Documents\WorkandLife\StarsailsClover",
  [string]$CommitMessage = "feat: sync dynamic SailsSite"
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path $RepoPath).Path
$owner = "StarsailsClover"
$name = "SailsSite"
$apiBase = "repos/$owner/$name"

function Invoke-GhApiJson {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,
    [AllowNull()]
    [string]$InputJson = $null,
    [int]$MaxAttempts = 4
  )

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    if ($null -eq $InputJson) {
      $output = & gh @Arguments 2>&1
    } else {
      $output = $InputJson | & gh @Arguments 2>&1
    }
    $exitCode = $LASTEXITCODE
    $text = ($output | Out-String).Trim()

    if ($exitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($text)) {
      try {
        return $text | ConvertFrom-Json
      } catch {
        if ($attempt -eq $MaxAttempts) {
          throw "gh api returned invalid JSON after $MaxAttempts attempts: $text"
        }
      }
    } elseif ($attempt -eq $MaxAttempts) {
      throw "gh api failed after $MaxAttempts attempts (exit $exitCode): $text"
    }

    Start-Sleep -Seconds ([Math]::Min(8, $attempt * 2))
  }
}

$parentSha = $null
try {
  $currentRef = Invoke-GhApiJson -Arguments @("api", "$apiBase/git/ref/heads/main")
  $parentSha = $currentRef.object.sha
} catch {
  $parentSha = $null
}
$readme = Get-Content -Raw (Join-Path $repo "_devdocs\SailsSite-README.md")

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
  $blob = Invoke-GhApiJson -Arguments @("api", "$apiBase/git/blobs", "--method", "POST", "--input", "-") -InputJson $payload
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
$readmeBlob = Invoke-GhApiJson -Arguments @("api", "$apiBase/git/blobs", "--method", "POST", "--input", "-") -InputJson $readmePayload
$entries.Add(@{
  path = "README.md"
  mode = "100644"
  type = "blob"
  sha = $readmeBlob.sha
})

$treePayload = @{ tree = $entries } | ConvertTo-Json -Depth 8 -Compress
$tree = Invoke-GhApiJson -Arguments @("api", "$apiBase/git/trees", "--method", "POST", "--input", "-") -InputJson $treePayload
$parents = @()
if ($parentSha) {
  $parents = @($parentSha)
}
$commitPayload = @{
  message = $CommitMessage
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
$commit = Invoke-GhApiJson -Arguments @("api", "$apiBase/git/commits", "--method", "POST", "--input", "-") -InputJson $commitPayload

if ($parentSha) {
  $refPayload = @{ sha = $commit.sha; force = $false } | ConvertTo-Json -Compress
  Invoke-GhApiJson -Arguments @("api", "$apiBase/git/refs/heads/main", "--method", "PATCH", "--input", "-") -InputJson $refPayload | Out-Null
} else {
  $refPayload = @{ ref = "refs/heads/main"; sha = $commit.sha } | ConvertTo-Json -Compress
  Invoke-GhApiJson -Arguments @("api", "$apiBase/git/refs", "--method", "POST", "--input", "-") -InputJson $refPayload | Out-Null
}

Write-Host "commit=$($commit.sha)"
