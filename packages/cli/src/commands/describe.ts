/**
 * describe — dumps the schema of czap's capsule catalog + CLI command
 * surface. Default format is JSON; `--format=mcp` emits MCP-compatible
 * JSON-RPC 2.0 tool descriptors.
 *
 * @module
 */

import { existsSync, readFileSync } from 'node:fs';

/** Closed catalog of the seven assembly kinds (matches ADR-0008). */
const ASSEMBLY_KINDS = [
  'pureTransform',
  'receiptedMutation',
  'stateMachine',
  'siteAdapter',
  'policyGate',
  'cachedProjection',
  'sceneComposition',
] as const;

/** CLI command descriptor. Minimal shape — full input/output schemas come later. */
interface CommandDescriptor {
  readonly name: string;
  readonly description: string;
  readonly args: Record<string, string>;
  readonly outputs: string;
}

const COMMANDS: readonly CommandDescriptor[] = [
  {
    name: 'describe',
    description: 'Dump capsule catalog schema',
    args: { format: "'json' | 'mcp' (optional)" },
    outputs: 'DescribeReceipt',
  },
  {
    name: 'doctor',
    description: 'Preflight rig-check: Node, pnpm, workspace, build artifacts, git hooks',
    args: {},
    outputs: 'DoctorReceipt',
  },
  {
    name: 'help',
    description: 'Print usage text (also: --help, -h, no args)',
    args: {},
    outputs: 'plain text on stdout (not a receipt)',
  },
  {
    name: 'version',
    description: 'Print czap, Node, and pnpm versions (also: --version, -V)',
    args: {},
    outputs: 'VersionReceipt',
  },
  {
    name: 'glossary',
    description: 'Look up a LiteShip / CZAP term from the prose register',
    args: { term: 'string (optional, omit for full list)' },
    outputs: 'GlossaryReceipt',
  },
  {
    name: 'scene.compile',
    description: 'Compile a scene capsule',
    args: { scene: 'string' },
    outputs: 'SceneCompileReceipt',
  },
  {
    name: 'scene.render',
    description: 'Render scene to mp4',
    args: { scene: 'string', output: 'string' },
    outputs: 'SceneRenderReceipt',
  },
  {
    name: 'scene.verify',
    description: 'Run scene generated tests',
    args: { scene: 'string' },
    outputs: 'SceneVerifyReceipt',
  },
  {
    name: 'scene.dev',
    description: 'Launch Vite + browser player',
    args: { scene: 'string' },
    outputs: 'SceneDevLaunchReceipt',
  },
  {
    name: 'asset.analyze',
    description: 'Run cachedProjection on asset',
    args: { asset: 'string', projection: "'beat' | 'onset' | 'waveform'" },
    outputs: 'AssetAnalyzeReceipt',
  },
  {
    name: 'asset.verify',
    description: 'Verify asset capsule',
    args: { asset: 'string' },
    outputs: 'AssetVerifyReceipt',
  },
  {
    name: 'capsule.inspect',
    description: 'Inspect a capsule manifest entry',
    args: { id: 'string' },
    outputs: 'CapsuleInspectReceipt',
  },
  {
    name: 'capsule.verify',
    description: 'Verify capsule generated tests',
    args: { id: 'string' },
    outputs: 'CapsuleVerifyReceipt',
  },
  {
    name: 'capsule.list',
    description: 'List capsules, optionally filtered by kind',
    args: { kind: 'AssemblyKind (optional)' },
    outputs: 'CapsuleListReceipt',
  },
  { name: 'gauntlet', description: 'Run the full gauntlet', args: {}, outputs: 'GauntletReceipt' },
  {
    name: 'ship',
    description:
      'Mint ShipCapsule(s) for one or more packages and (unless --dry-run) hand off to pnpm publish (ADR-0011)',
    args: {
      filter: 'string (optional, package path or @scope/name)',
      'dry-run': 'boolean (optional, write capsules + .tgz only, do not publish)',
    },
    outputs: 'ShipReceipt (one per package)',
  },
  {
    name: 'verify',
    description: 'Locally verify a tarball against its ShipCapsule (ADR-0011 §verify; no network, no registry)',
    args: { tarball: 'string', capsule: 'string (--capsule <path>)' },
    outputs: 'ShipVerifyReceipt',
  },
  {
    name: 'mcp',
    description: 'Start the MCP server (stdio default; --http=PORT for HTTP)',
    args: { http: 'string (optional, port number)' },
    outputs: 'MCP server (long-running)',
  },
] as const;

/** Result of `describe` in JSON mode. */
export interface DescribeReceipt {
  readonly assemblyKinds: readonly string[];
  readonly commands: readonly CommandDescriptor[];
}

/** MCP tool descriptor as emitted in --format=mcp mode. */
export interface McpToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: object;
}

/** Execute the describe command. */
export function describe(
  args: { format?: 'json' | 'mcp' } = {},
): DescribeReceipt | { tools: readonly McpToolDescriptor[] } {
  if (args.format === 'mcp') {
    const cachedManifest = '.czap/generated/mcp-manifest.json';
    if (existsSync(cachedManifest)) {
      return JSON.parse(readFileSync(cachedManifest, 'utf8')) as { tools: readonly McpToolDescriptor[] };
    }
    return {
      tools: COMMANDS.map((c) => ({
        name: c.name,
        description: c.description,
        inputSchema: { type: 'object', properties: {} },
      })),
    };
  }
  return { assemblyKinds: ASSEMBLY_KINDS, commands: COMMANDS };
}
