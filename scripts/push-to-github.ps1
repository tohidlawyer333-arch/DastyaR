$ErrorActionPreference = 'Stop'
$remote = 'https://github.com/tohidlawyer333-arch/DastyaR.git'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git نصب نیست. ابتدا Git for Windows را نصب کنید.' }
if (-not (Test-Path '.git')) { git init -b main }
$existing = git remote 2>$null
if (-not ($existing -contains 'origin')) { git remote add origin $remote }
git add .
$staged = git diff --cached --name-only
if ($staged) { git commit -m 'Initial DastyaR desktop legal assistant scaffold' }
git branch -M main
git push -u origin main
Write-Host 'DastyaR source pushed to GitHub. Open Actions to check the Windows build.'
