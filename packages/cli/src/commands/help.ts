/**
 * help — friendly usage text for the `czap` CLI. Emits human-readable
 * text to stdout (no JSON wrapping); the AI-facing discovery surface
 * is `czap describe`.
 *
 * @module
 */

const USAGE = `czap — LiteShip CLI

Usage:
  czap <command> [args]

Common commands:
  doctor                  Preflight rig-check (Node, pnpm, build, hooks)
  describe [--format=mcp] Schema of capsule catalog + commands (AI surface)
  glossary [term]         Look up a LiteShip / CZAP term from the ontology
  version                 Print czap, Node, and pnpm versions
  help                    This message

Scene + asset:
  scene compile <id>      Compile a scene capsule
  scene render <id> -o    Render scene to mp4
  scene verify <id>       Run scene generated tests
  scene dev <id>          Launch Vite + browser player
  asset analyze <id> --projection=<beat|onset|waveform>
  asset verify <id>

Capsule manifest:
  capsule inspect <id>
  capsule list [--kind=<kind>]
  capsule verify <id>

Release:
  ship [--filter=<pkg>] [--dry-run]
  verify <tarball.tgz> --capsule=<path>
  gauntlet [--dry-run]

Servers:
  mcp [--http=<port>]     Start MCP server (stdio default)

Hints:
  - First time? Run \`pnpm setup\` from the repo root.
  - Stuck? Run \`czap doctor\` to triage your environment.
  - All commands emit JSON receipts to stdout; errors go to stderr.

Docs:
  https://github.com/heyoub/LiteShip
`;

/** Print the help text to stdout. Returns exit code 0. */
export function help(): number {
  process.stdout.write(USAGE);
  return 0;
}

/** Exported for tests so they don't depend on the formatted shape. */
export const HELP_TEXT = USAGE;
