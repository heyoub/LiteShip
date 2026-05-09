# `@czap/_spine`

Type-only declaration spine for czap. Published `.d.ts` from `@czap/core` and
`@czap/scene` reference symbols defined here so consumers' `tsc` can resolve
branded contracts without pulling runtime JavaScript from this package.

- **Runtime:** none — the npm tarball contains declarations (and this README)
  only.
- **Consumers:** depend on `@czap/_spine` the same way core/scene do; do not
  import it from browser bundles unless you only need types at compile time.

See the monorepo [README](https://github.com/TheFreeBatteryFactory/czap#readme) and [docs/ARCHITECTURE.md](https://github.com/TheFreeBatteryFactory/czap/blob/main/docs/ARCHITECTURE.md).
