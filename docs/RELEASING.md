# Releasing LiteShip (`@czap/*`)

Operator vocabulary: [GLOSSARY.md](./GLOSSARY.md). LiteShip (product), CZAP (engine), `@czap/*` (packages). CLI and commands stay `czap`.

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

Publish via `czap ship`, which mints a `ShipCapsule` for every `packages/*` workspace before handing the tarballs to `pnpm publish` (ADR-0011). Dry-run first so the receipts and `pnpm publish --dry-run` outputs are both observable without uploading:

```bash
pnpm exec czap ship --filter "./packages/*" --dry-run
pnpm exec czap ship --filter "./packages/*"
```

The dry-run still writes `<pkg>-<version>.shipcapsule.cbor` next to each `<pkg>-<version>.tgz` in the package directories. Inspect either with `pnpm exec czap verify <tarball> --capsule <cbor>` before going live.

## Attach ShipCapsules to the GitHub Release

After publish, attach every capsule to the GitHub release so downstream consumers can verify their npm-downloaded tarballs against a non-npm-hosted receipt:

```bash
gh release upload v0.1.0 packages/*/czap-*-0.1.0.shipcapsule.cbor
```

The `.tgz` files in `packages/*/` after ship are intermediate (npm has the canonical copy). Clean them up once the release is final:

```bash
rm -f packages/*/czap-*-0.1.0.tgz
```

## Verifying a published package (consumer side)

Anyone with the published `.tgz` and the GitHub-attached `.shipcapsule.cbor` can verify locally:

```bash
pnpm pack @czap/core@0.1.0   # or download the .tgz from npm directly
gh release download v0.1.0 -p 'czap-core-0.1.0.shipcapsule.cbor'
pnpm exec czap verify czap-core-0.1.0.tgz --capsule czap-core-0.1.0.shipcapsule.cbor
```

Verdicts and exit codes:

| Verdict | Exit | Meaning |
|---|---|---|
| `Verified` | 0 | Tarball manifest matches the capsule. |
| `Mismatch` | 2 | Tarball differs from the capsule. |
| `Incomplete` | 3 | Capsule is malformed or non-canonical. |
| `Unknown` | 4 | No capsule supplied — verification declined, not refused. |

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
