# Pre-public git history scrub

Use this checklist **before** the repository is public if local machine paths or
editor-only files ever appeared in git history.

## Discover

### PowerShell

```powershell
git log --oneline --all -- .claude/settings.local.json
git rev-list --all | ForEach-Object { git grep -n -I "c:\\Users\\YourUser" $_ 2>$null }
git rev-list --all | ForEach-Object { git grep -n -I "<username>" $_ 2>$null }
```

Use `2>$null` so PowerShell hides `git grep` "no match" noise. Replace path
fragments with what you are hunting.

### bash

```bash
git log --oneline --all -- .claude/settings.local.json
git rev-list --all | while read -r rev; do
  git grep -n -I "c:\\Users\\YourUser" "$rev" -- 2>/dev/null
done
git rev-list --all | while read -r rev; do
  git grep -n -I "<username>" "$rev" -- 2>/dev/null
done
```

Use `2>/dev/null` (not PowerShell `$null`). Adjust the Windows path fragment as needed.

One-shot (can be slow on huge histories):

```bash
git grep -n -I "<username>" $(git rev-list --all) --
```

## Noisy commit messages (optional)

If a private branch has giant paste commits (for example old gauntlet logs) and
you want a terse public history, that is cosmetic: `git filter-repo` message
filters or an interactive rebase can trim them. That is not a substitute for
removing secrets or machine paths.

## Backup

```bash
git branch backup/pre-public-history-scrub
git remote -v
```

## Rewrite

Install [git-filter-repo](https://github.com/newren/git-filter-repo), then remove agreed paths. Example:

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