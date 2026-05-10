# Releasing LiteShip (`@czap/*`)

Operator vocabulary: [GLOSSARY.md](./GLOSSARY.md) — **LiteShip** (product), **CZAP** (engine), **`@czap/*`** (packages). CLI and commands stay `czap`.

Operator checklist for public npm and GitHub releases. Run destructive git steps locally.

## Preconditions

- Release-blocking gates (for example `pnpm run gauntlet:full`) are green on the ship commit.
- Run `pnpm run package:smoke` on the ship commit. This packs every publishable
  `@czap/*` scope, installs the tarballs in a throwaway consumer, verifies export
  imports, runs the CLI, and fails if a packed manifest still contains
  `workspace:*`.
- Publish with pnpm workspace tooling only. Plain `npm publish` does not rewrite
  `workspace:*` specs for downstream consumers.
- Run `pnpm run release:notes` so `RELEASE_NOTES_v0.1.0.md` matches the canonical `## [0.1.0]` block in `CHANGELOG.md`. Do not paste the full changelog into GitHub Releases.

## Extract release notes

```bash
pnpm run release:notes
```

Create the GitHub release:

```bash
gh release create v0.1.0 --title "v0.1.0" --notes-file RELEASE_NOTES_v0.1.0.md
```

## Publish packages

Publish only `packages/*` workspaces:

```bash
pnpm --filter "./packages/*" -r publish --dry-run --no-git-checks --access public
pnpm --filter "./packages/*" -r publish --no-git-checks --access public
```

## Tag

```bash
git tag v0.1.0
git push origin v0.1.0
```

Use `git push --force-with-lease` only after a coordinated history rewrite.

## Pre-public history scrub

Untracking a file does not remove old blobs. See [HISTORY_SCRUB.md](./HISTORY_SCRUB.md) for discovery, backup, and `git filter-repo` steps.

## MCP and CLI

`@czap/mcp-server` requires `@czap/cli` as a peer (lazy `import()` at runtime).
`@czap/cli` loads `@czap/mcp-server` only for the `czap mcp` subcommand (dynamic
`import()`); add `@czap/mcp-server` when you use MCP mode. Ship matching versions
whenever you publish either package.
