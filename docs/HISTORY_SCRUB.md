# Pre-public git history scrub

Use this checklist **before** the repository is public if local machine paths or
editor-only files ever appeared in git history.

## Discover

```powershell
git log --all -- .claude/settings.local.json
git rev-list --all | ForEach-Object { git grep -n -I "c:\\Users\\YourUser" $_ 2>$null }
```

Replace the path fragment with what you are hunting.

## Backup

```powershell
git branch backup/pre-public-history-scrub
git remote -v
```

## Rewrite

Install `git-filter-repo`, then remove agreed paths. Example:

```bash
git filter-repo --force --invert-paths --path .claude/settings.local.json
```

`git filter-repo` may remove the `origin` remote as a safety measure. Re-add it
from your saved `git remote -v` output if needed.

## Verify

Re-run the discovery greps. They must be clean for the paths you care about.

## Coordinate

Use `git push --force-with-lease` only with team agreement. Everyone with an old
clone must reset or re-clone.

See also [RELEASING.md](./RELEASING.md).
