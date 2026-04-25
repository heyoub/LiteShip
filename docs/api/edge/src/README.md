[**czap**](../../README.md)

***

[czap](../../README.md) / edge/src

# edge/src

`@czap/edge` -- Edge pipeline for server-side tier detection, boundary
caching, and theme compilation.

Parses HTTP Client Hints headers into device capabilities, maps them
to the same tier lattice used on the client, and provides helpers for
HTML injection, KV-backed boundary caching, and per-tenant theme
compilation.

## Namespaces

- [ClientHints](namespaces/ClientHints/README.md)
- [EdgeHostAdapter](namespaces/EdgeHostAdapter/README.md)
- [EdgeTier](namespaces/EdgeTier/README.md)

## Interfaces

- [BoundaryCache](interfaces/BoundaryCache.md)
- [ClientHintsHeaders](interfaces/ClientHintsHeaders.md)
- [CompiledOutputs](interfaces/CompiledOutputs.md)
- [EdgeHostAdapter](interfaces/EdgeHostAdapter.md)
- [EdgeHostAdapterConfig](interfaces/EdgeHostAdapterConfig.md)
- [EdgeHostCacheConfig](interfaces/EdgeHostCacheConfig.md)
- [EdgeHostCompileContext](interfaces/EdgeHostCompileContext.md)
- [EdgeHostContext](interfaces/EdgeHostContext.md)
- [EdgeHostResolution](interfaces/EdgeHostResolution.md)
- [EdgeTierResult](interfaces/EdgeTierResult.md)
- [KVNamespace](interfaces/KVNamespace.md)
- [ThemeCompileConfig](interfaces/ThemeCompileConfig.md)
- [ThemeCompileResult](interfaces/ThemeCompileResult.md)

## Type Aliases

- [EdgeHostCacheStatus](type-aliases/EdgeHostCacheStatus.md)

## Variables

- [ClientHints](variables/ClientHints.md)
- [EdgeHostAdapter](variables/EdgeHostAdapter.md)
- [EdgeTier](variables/EdgeTier.md)
- [KVCache](variables/KVCache.md)

## Functions

- [compileTheme](functions/compileTheme.md)
- [createBoundaryCache](functions/createBoundaryCache.md)
- [createEdgeHostAdapter](functions/createEdgeHostAdapter.md)
