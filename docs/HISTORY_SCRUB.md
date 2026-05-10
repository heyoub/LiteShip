# Pre-public git history scrub

This checklist applies to the LiteShip monorepo (GitHub path `heyoub/LiteShip`); clone directory names may still read `czap` on disk.

Use this checklist before the repository is public if local machine paths or editor-only files ever appeared in git history.

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

## Completion log

The pre-public scrub for the v0.1.0 publish was executed 2026-05-10. What it covered:

- [x] **Blob substitution**: every occurrence of the prior maintainer's
      Windows username inside file content (across all 82 commits) replaced
      with `<username>` via `git filter-repo --replace-text`. Affected
      strings included `C:\Users\…`, `c:\Users\…`, `C:/Users/…`,
      `/c/Users/…`, and the path-encoded `C--Users-…` form used by
      sandbox tooling.
- [x] **Commit-message substitution**: same string scrubbed from every
      commit message via `git filter-repo --replace-message`. Four prior
      commits had referenced the username inside changelog-style prose;
      all four are now `<username>`.
- [x] **Identity collapse**: the four committer/author identities present
      in pre-scrub history (`Heyoub <hello@forgestack.app>`,
      `Eassa Ayoub <hello@heyoub.dev>`, `Cursor Agent
      <cursoragent@cursor.com>`, `Claude <noreply@anthropic.com>`)
      collapsed via `git filter-repo --mailmap` to two:
      `heyoub <eassa@heyoub.dev>` for human + tooling commits, and
      `Claude <noreply@anthropic.com>` preserved for AI-attributed
      commits per standard practice. The web-merge committer
      `GitHub <noreply@github.com>` is preserved (GitHub-side
      identity, not maintainer-controlled).
- [x] **Verification**: `git log --all -p | grep -ci eayou` and
      `git log --format=%B | grep -ci eayou` both report `0` after
      the scrub. `git log --format='%an <%ae>' | sort -u` reports
      only the two intended author identities.
- [x] **Force-push**: rewritten history pushed to
      `claude/prepare-for-release-fhytA` with
      `git push --force-with-lease`. There were no public clones at
      the time of the scrub, so blast radius was limited to the
      maintainer's local working copies.

If a future scrub is needed, restart from "Discover" above with the new
target string. The completion log applies only to the v0.1.0 wave.

See also [RELEASING.md](./RELEASING.md).