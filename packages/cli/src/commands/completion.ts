/**
 * completion — emit shell completion scripts for bash / zsh / fish.
 * Source the output in your shell rc to get tab-completion for `czap`
 * verbs and their subcommands.
 *
 * Usage:
 *   czap completion bash >> ~/.bashrc
 *   czap completion zsh  >> ~/.zshrc
 *   czap completion fish > ~/.config/fish/completions/czap.fish
 *
 * The verb lists are hand-maintained to mirror dispatch.ts, and a
 * regression test fails if they drift.
 *
 * @module
 */

import { emitError } from '../receipts.js';

/** Top-level verbs the CLI dispatches. Mirrors dispatch.ts's switch. */
export const TOP_LEVEL_VERBS = [
  'completion',
  'describe',
  'doctor',
  'glossary',
  'help',
  'version',
  'scene',
  'asset',
  'capsule',
  'gauntlet',
  'ship',
  'verify',
  'mcp',
] as const;

/** Subcommands by verb. Empty array means the verb takes no subcommand. */
export const SUBCOMMANDS = {
  scene: ['compile', 'render', 'verify', 'dev'],
  asset: ['analyze', 'verify'],
  capsule: ['inspect', 'list', 'verify'],
  completion: ['bash', 'zsh', 'fish'],
} as const satisfies Readonly<Record<string, readonly string[]>>;

type Shell = 'bash' | 'zsh' | 'fish';

function isShell(s: string | undefined): s is Shell {
  return s === 'bash' || s === 'zsh' || s === 'fish';
}

function bashScript(): string {
  const verbs = TOP_LEVEL_VERBS.join(' ');
  const sceneSubs = SUBCOMMANDS.scene.join(' ');
  const assetSubs = SUBCOMMANDS.asset.join(' ');
  const capsuleSubs = SUBCOMMANDS.capsule.join(' ');
  const shellSubs = SUBCOMMANDS.completion.join(' ');
  return `# czap bash completion
_czap_completion() {
  local cur prev
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  if [ "\$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( \$(compgen -W "${verbs}" -- "\$cur") )
    return
  fi
  case "\$prev" in
    scene)      COMPREPLY=( \$(compgen -W "${sceneSubs}" -- "\$cur") );;
    asset)      COMPREPLY=( \$(compgen -W "${assetSubs}" -- "\$cur") );;
    capsule)    COMPREPLY=( \$(compgen -W "${capsuleSubs}" -- "\$cur") );;
    completion) COMPREPLY=( \$(compgen -W "${shellSubs}" -- "\$cur") );;
  esac
}
complete -F _czap_completion czap
`;
}

function zshScript(): string {
  const verbs = TOP_LEVEL_VERBS.join(' ');
  const sceneSubs = SUBCOMMANDS.scene.join(' ');
  const assetSubs = SUBCOMMANDS.asset.join(' ');
  const capsuleSubs = SUBCOMMANDS.capsule.join(' ');
  const shellSubs = SUBCOMMANDS.completion.join(' ');
  return `# czap zsh completion
_czap() {
  local -a verbs
  verbs=(${verbs})
  if (( CURRENT == 2 )); then
    _describe -t commands 'czap verb' verbs
    return
  fi
  case "\${words[2]}" in
    scene)      _values 'scene subcommand' ${sceneSubs} ;;
    asset)      _values 'asset subcommand' ${assetSubs} ;;
    capsule)    _values 'capsule subcommand' ${capsuleSubs} ;;
    completion) _values 'shell' ${shellSubs} ;;
  esac
}
compdef _czap czap
`;
}

function fishScript(): string {
  const lines: string[] = ['# czap fish completion'];
  for (const v of TOP_LEVEL_VERBS) {
    lines.push(`complete -c czap -f -n '__fish_use_subcommand' -a '${v}'`);
  }
  for (const [verb, subs] of Object.entries(SUBCOMMANDS)) {
    for (const s of subs) {
      lines.push(`complete -c czap -f -n '__fish_seen_subcommand_from ${verb}' -a '${s}'`);
    }
  }
  return lines.join('\n') + '\n';
}

/** Execute the completion command. Returns a process exit code. */
export function completion(shell: string | undefined): number {
  if (!isShell(shell)) {
    emitError('completion', `expected shell: bash | zsh | fish (got: ${shell ?? '<missing>'})`);
    return 1;
  }
  if (shell === 'bash') process.stdout.write(bashScript());
  else if (shell === 'zsh') process.stdout.write(zshScript());
  else process.stdout.write(fishScript());
  return 0;
}
