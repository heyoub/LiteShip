// Ambient declaration for @czap/mcp-server, used only by the dynamic
// import in dispatch.ts (`mcp` subcommand).
//
// mcp-server has a static `import { run } from '@czap/cli'`, so its
// tsconfig references cli. If cli also project-referenced mcp-server,
// tsc --build would refuse the cycle. cli's import is dynamic and only
// uses `start({ http?: string })`, so a local subset declaration here
// breaks the type-time dependency: cli compiles cold without needing
// `packages/mcp-server/dist/index.d.ts` to exist first. At runtime the
// real module resolves through the pnpm workspace symlink.
declare module '@czap/mcp-server' {
  export function start(opts?: { http?: string }): Promise<void>;
}
