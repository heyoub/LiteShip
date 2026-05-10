# `@czap/cli`

The `czap` CLI ships with **LiteShip** — JSON-first machine interface for the **CZAP** engine, human-friendly TTY mode. Naming: [../../docs/GLOSSARY.md](../../docs/GLOSSARY.md).

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

See [docs/GETTING-STARTED.md](https://github.com/heyoub/LiteShip/blob/main/docs/GETTING-STARTED.md).
