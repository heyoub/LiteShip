// Ambient declaration for @czap/mcp-server, used only by the dynamic
// import in dispatch.ts (`mcp` subcommand).
//
// `@czap/mcp-server` loads `@czap/cli` lazily at runtime (peer) and does not
// project-reference `@czap/cli`, so `tsc --build` stays acyclic. This local
// subset keeps `@czap/cli` cold-compilable without needing
// `packages/mcp-server/dist/index.d.ts` first. At runtime the real module
// resolves through the pnpm workspace symlink / npm peer install.
declare module '@czap/mcp-server' {
  export function start(opts?: { http?: string }): Promise<void>;
}
