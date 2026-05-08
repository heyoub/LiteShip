# `@czap/cli`

The `czap` CLI: JSON-first machine interface with a human-friendly TTY mode.

## Install

```bash
pnpm add -D @czap/cli
```

## Usage

```bash
pnpm exec czap describe --format=json
```

The `mcp` subcommand dynamically imports `@czap/mcp-server`. Install
`@czap/mcp-server` alongside `@czap/cli` when you need MCP mode, and keep both
on the same semver line.

See [docs/GETTING-STARTED.md](../../docs/GETTING-STARTED.md).
