[**LiteShip**](../../README.md)

***

[LiteShip](../../modules.md) / web/src

# web/src

`@czap/web` — DOM runtime for **LiteShip**: stitches **CZAP** projections
(CSS, streamed HTML, LLM chunks, workers) into a live browser document.

It ships:

- [Morph](variables/Morph.md): idiomorph-style DOM diffing that preserves focus,
  scroll, and form state across re-renders.
- [SlotRegistry](namespaces/SlotRegistry/README.md) / [SlotAddressing](variables/SlotAddressing.md): stable addressing
  for server-rendered slots in streaming HTML.
- [SSE](variables/SSE.md) / [Resumption](variables/Resumption.md): an Effect-scoped Server-Sent
  Events client with reconnect and cross-tab resumption.
- [LLMAdapter](namespaces/LLMAdapter/README.md) and [LLMChunkNormalization](variables/LLMChunkNormalization.md): normalization
  of streaming LLM chunk formats (OpenAI / Anthropic / AI SDK).
- [Physical](variables/Physical.md): DOM state capture and restore for hot reloads.
- `WebCodecs` / `Mediabunny` capture helpers for client-side recording.
- `createAudioProcessor` for AudioWorklet-based real-time audio graphs.

## Namespaces

- [LLMAdapter](namespaces/LLMAdapter/README.md)
- [SlotRegistry](namespaces/SlotRegistry/README.md)
- [WebCodecsCapture](namespaces/WebCodecsCapture/README.md)

## Interfaces

- [AudioProcessor](interfaces/AudioProcessor.md)
- [BackpressureHint](interfaces/BackpressureHint.md)
- [FocusState](interfaces/FocusState.md)
- [IMEState](interfaces/IMEState.md)
- [LLMAdapterShape](interfaces/LLMAdapterShape.md)
- [LLMChunk](interfaces/LLMChunk.md)
- [LLMStreamConfig](interfaces/LLMStreamConfig.md)
- [MatchResult](interfaces/MatchResult.md)
- [MorphCallbacks](interfaces/MorphCallbacks.md)
- [MorphConfig](interfaces/MorphConfig.md)
- [MorphHints](interfaces/MorphHints.md)
- [MorphRejection](interfaces/MorphRejection.md)
- [PhysicalState](interfaces/PhysicalState.md)
- [ReconnectConfig](interfaces/ReconnectConfig.md)
- [ResumptionConfig](interfaces/ResumptionConfig.md)
- [ResumptionState](interfaces/ResumptionState.md)
- [RuntimeEndpointPolicy](interfaces/RuntimeEndpointPolicy.md)
- [ScrollPosition](interfaces/ScrollPosition.md)
- [SelectionState](interfaces/SelectionState.md)
- [SlotEntry](interfaces/SlotEntry.md)
- [SlotRegistryShape](interfaces/SlotRegistryShape.md)
- [SSEClient](interfaces/SSEClient.md)
- [SSEConfig](interfaces/SSEConfig.md)
- [WebCodecsCaptureOptions](interfaces/WebCodecsCaptureOptions.md)

## Type Aliases

- [ChunkParser](type-aliases/ChunkParser.md)
- [HtmlPolicy](type-aliases/HtmlPolicy.md)
- [IslandMode](type-aliases/IslandMode.md)
- [LLMChunkType](type-aliases/LLMChunkType.md)
- [MatchPriority](type-aliases/MatchPriority.md)
- [MorphResult](type-aliases/MorphResult.md)
- [RenderFn](type-aliases/RenderFn.md)
- [ResumeResponse](type-aliases/ResumeResponse.md)
- [RuntimeEndpointKind](type-aliases/RuntimeEndpointKind.md)
- [RuntimeUrlResolution](type-aliases/RuntimeUrlResolution.md)
- [SlotPath](type-aliases/SlotPath.md)
- [SlotPath](type-aliases/SlotPath-1.md)
- [SSEMessage](type-aliases/SSEMessage.md)
- [SSEState](type-aliases/SSEState.md)
- [ToolCallAccumulator](type-aliases/ToolCallAccumulator.md)

## Variables

- [Hints](variables/Hints.md)
- [LLMAdapter](variables/LLMAdapter.md)
- [LLMChunkNormalization](variables/LLMChunkNormalization.md)
- [Morph](variables/Morph.md)
- [Physical](variables/Physical.md)
- [Resumption](variables/Resumption.md)
- [SemanticId](variables/SemanticId.md)
- [SlotAddressing](variables/SlotAddressing.md)
- [SlotRegistry](variables/SlotRegistry.md)
- [SSE](variables/SSE.md)
- [streamReceiptCapsule](variables/streamReceiptCapsule.md)
- [WebCodecsCapture](variables/WebCodecsCapture.md)

## Functions

- [captureVideo](functions/captureVideo.md)
- [createAudioProcessor](functions/createAudioProcessor.md)
- [createHtmlFragment](functions/createHtmlFragment.md)
- [isPrivateOrReservedIP](functions/isPrivateOrReservedIP.md)
- [renderToCanvas](functions/renderToCanvas.md)
- [resolveHtmlString](functions/resolveHtmlString.md)
- [resolveRuntimeUrl](functions/resolveRuntimeUrl.md)
- [sanitizeHTML](functions/sanitizeHTML.md)
