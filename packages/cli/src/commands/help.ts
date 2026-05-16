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

Cast off (dev experience):
  doctor [--fix]          Preflight rig-check; --fix relays the cheap repairs
  describe [--format=mcp] Schema of capsule catalog + commands (AI surface)
  glossary [term]         Look up a LiteShip / CZAP term from the ontology
  version                 Print czap, Node, and pnpm versions
  completion <shell>      Emit shell completion (bash | zsh | fish)
  help                    This chart

Compose + render (scene + asset):
  scene compile <id>      Compile a scene capsule
  scene render <id> -o    Render scene to mp4
  scene verify <id>       Run scene generated tests
  scene dev <id>          Launch Vite + browser player
  asset analyze <id> --projection=<beat|onset|waveform>
  asset verify <id>

Manifest (capsule):
  capsule inspect <id>
  capsule list [--kind=<kind>]
  capsule verify <id>

Ship out (release):
  ship [--filter=<pkg>] [--dry-run]
  verify <tarball.tgz> --capsule=<path>
  gauntlet [--dry-run]

Servers:
  mcp [--http=<port>]     Start MCP server (stdio default)

Hints (a working deck):
  - First time? Run \`pnpm setup\` for the full shakedown.
  - Stuck? \`czap doctor\` triages your environment; \`czap doctor --fix\` repairs.
  - All commands emit JSON receipts on stdout; pretty output is on stderr.
  - Suppress color: NO_COLOR=1.  Force color in CI logs: FORCE_COLOR=1.

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
