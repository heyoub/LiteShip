declare module '@czap/cli' {
  export function run(argv: readonly string[]): Promise<number>;
}
