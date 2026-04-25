# Last-Mile Worker and LLM Refactor

## Summary

Tracked implementation control doc for the worker-only seam and LLM steady-state cleanup wave.

This document is the execution truth for this refactor. It should be updated:
- before each implementation batch
- after each verification batch
- whenever a working hypothesis changes

## Baseline

Current known starting point before this wave:
- `worker-runtime-startup` remains high as a broad continuity diagnostic
- `worker-runtime-startup-shared` is within target
- dominant worker residual stage is `state-delivery:message-receipt`
- `llm-runtime-steady` is diagnostic-only, but replicate exceedances still appear in noisier runs

## Working Hypotheses

### Worker startup

- The remaining startup debt is mostly worker-only handoff cost, not shared bootstrap debt.
- A minimal startup/takeover ack can reduce redundant payload receipt and callback cost.
- Better seam share and tail telemetry will make it obvious when the debt shifts from worker transport to host callback pressure.

### LLM steady-state

- Current steady-state residue is more likely scheduling/coalescing tax than parsing tax.
- Bursty contiguous text should be coalesced into one scheduled drain.
- Tool-call delta chunks that produce no visible output should not trigger extra flush turns.

## Checklist

### Worker signals

- [x] add richer seam metrics to startup scenario types
- [x] add seam share / concentration metrics
- [x] add seam tail ratio metric
- [x] add runtime-seams interpretation rules for worker startup

### Worker handoff optimization

- [x] add explicit `resolved-state-ack` message shape
- [x] teach compositor worker to emit minimal ack when mirrored startup state agrees
- [x] handle ack in host/compositor wrapper
- [x] clear pending agreement in Astro worker runtime without redundant DOM application

### LLM steady optimization

- [x] add long-session steady diagnostics
- [x] add mixed text/tool steady diagnostics
- [x] coalesce contiguous text burst scheduling
- [x] suppress extra flush scheduling for tool-call buffering-only chunks

### Report and artifact updates

- [x] extend bench artifact output
- [x] extend runtime-seams report output
- [x] update `docs/STATUS.md`
- [x] keep integrity/satellite/feedback checks coherent

### Verification

- [x] targeted worker tests
- [x] targeted LLM tests
- [x] targeted telemetry/integrity tests
- [ ] bench gate
- [ ] bench reality
- [ ] coverage merge
- [ ] runtime seams
- [ ] audit
- [ ] satellite scan
- [ ] feedback verify

## Before / After

### Before

- worker shared startup parity:
- worker-only seam absolute:
- message receipt residual:
- message receipt share:
- llm steady median overhead:
- llm steady exceedance rate:

### After

- worker shared startup parity:
- worker-only seam absolute:
- message receipt residual:
- message receipt share:
- llm steady median overhead:
- llm steady exceedance rate:
- targeted verification status: typecheck + worker/unit/browser/integrity slices green

## Notes

- Do not change the host-authoritative visible first paint contract.
- Do not promote SAB/shared-memory transport in this wave.
- If a metric improvement depends on redefining truth rather than improving the runtime, stop and document it here.
- Batch update 2026-04-10:
  - implemented enriched startup ack payload plumbing
  - added worker seam share / tail metrics and runtime-seams early-warning interpretations
  - added LLM steady-state exceedance, ratio, and scaling signals
  - validated the changed lanes with targeted typecheck, unit, component, browser, and artifact-integrity suites
  - reconciled the remaining gauntlet blocker: Astro worker branch coverage now expects `ack: true` for bootstrap and apply resolved-state messages because startup settle acks are intentionally subscribed before dispatch
