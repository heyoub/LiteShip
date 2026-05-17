# `@czap/cli`

The `czap` CLI ships with **LiteShip** — JSON-first machine interface for the **CZAP** engine, human-friendly TTY mode. Naming: [../../docs/GLOSSARY.md](../../docs/GLOSSARY.md).

## Install

```bash
pnpm add -D @czap/cli
```

## Verbs

Every command emits a JSON receipt to stdout. Pretty TTY summaries (when stderr is a terminal) go to stderr only — receipts on stdout stay machine-clean so they pipe cleanly into `jq`, MCP, or CI annotators. Exception: `czap completion <shell>` writes a raw shell-completion script to stdout (no JSON wrapper) so `eval "$(czap completion bash)"` and friends work directly.

### Cast off (dev experience)

| Verb | What it does |
| --- | --- |
| `czap doctor [--fix] [--ci]` | Preflight rig check. Probes Node, pnpm, workspace install, built dist/, git hooks, git config, Playwright, WASM toolchain (if `crates/` present). `--fix` auto-remediates cheap cases; `--ci` escalates warnings to exit 1. |
| `czap help` | The chart — every verb grouped by phase. |
| `czap glossary [term]` | Ontology lookup. Mirrors `docs/GLOSSARY.md` so AI agents can resolve register without leaving the shell. |
| `czap completion <bash\|zsh\|fish>` | Emit a tab-completion script. `eval "$(czap completion bash)"` to load. |
| `czap version` | Print the @czap/cli version. |

### Describe + MCP (machine interface)

| Verb | What it does |
| --- | --- |
| `czap describe [--format=json\|mcp]` | Self-describe the CLI surface (verbs, capsule factories, schema). |
| `czap mcp` | Start the MCP server (dynamically imports `@czap/mcp-server`). |

### Compose + render (scene + asset)

| Verb | What it does |
| --- | --- |
| `czap scene compile <path>` | Compile a scene definition. |
| `czap scene dev <path>` | Watch + recompile. |
| `czap scene render <path> [-o out]` | Render scene to disk. |
| `czap scene verify <path>` | Verify a scene definition. |
| `czap asset analyze <path>` | Analyze an asset capsule. |
| `czap asset verify <path>` | Verify an asset capsule. |

### Manifest (capsule)

| Verb | What it does |
| --- | --- |
| `czap capsule list` | List capsule factories. |
| `czap capsule inspect <id>` | Inspect a capsule's schema + dispatch. |
| `czap capsule verify <path>` | Verify a capsule definition. |

### Ship out (quay-side, release)

| Verb | What it does |
| --- | --- |
| `czap gauntlet` | Run the release-grade gate (32 phases). |
| `czap ship <pkg>` | Publish a package to npm (idempotent). `czap ship` ties packages up at the quay; `czap verify` checks the receipt before they sail. |
| `czap verify` | Post-ship verification (ADR-0011 four-verdict local verifier). |

The `mcp` subcommand dynamically imports `@czap/mcp-server`. Install `@czap/mcp-server` alongside `@czap/cli` when you need MCP mode, and keep both on the same semver line.

See [docs/GETTING-STARTED.md](https://github.com/heyoub/LiteShip/blob/main/docs/GETTING-STARTED.md).
