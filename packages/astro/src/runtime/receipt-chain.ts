import { DAG, Diagnostics } from '@czap/core';
import type { Receipt, UIFrame } from '@czap/core';

type ReceiptEnvelope = Receipt.Envelope;
type ReceiptTrustMode = 'advisory-unverified';

interface ReceiptChainShape {
  rememberFrame(frame: UIFrame): void;
  ingestEnvelope(envelope: ReceiptEnvelope): boolean;
  hasFramesAfter(receiptId: string | null): boolean;
  getFramesAfter(receiptId: string | null): readonly UIFrame[];
  latestReceiptId(): string | null;
  trustMode(): ReceiptTrustMode;
}

/**
 * Build a new in-memory receipt chain. Owns a DAG of ingested receipt
 * envelopes plus a map of remembered frames keyed by receipt id, so
 * the LLM directive can replay gaps when the SSE stream reconnects.
 *
 * The chain currently treats signatures as advisory; a diagnostic is
 * emitted when signed envelopes arrive without a configured verifier.
 */
export function createReceiptChain(): ReceiptChainShape {
  let dag = DAG.empty();
  const framesByReceipt = new Map<string, UIFrame>();
  const orderedReceipts: string[] = [];

  const orderedFrameIds = (): readonly string[] => {
    if (DAG.size(dag) > 0) {
      const ids = DAG.linearize(dag)
        .map((envelope) => envelope.hash)
        .filter((hash) => framesByReceipt.has(hash));
      if (ids.length > 0) {
        return ids;
      }
    }

    return orderedReceipts;
  };

  return {
    rememberFrame(frame) {
      framesByReceipt.set(frame.receiptId, frame);
      if (!orderedReceipts.includes(frame.receiptId)) {
        orderedReceipts.push(frame.receiptId);
      }
    },

    ingestEnvelope(envelope) {
      if (envelope.signature) {
        Diagnostics.warnOnce({
          source: 'czap/astro.receipt-chain',
          code: 'receipt-signature-unverified',
          message:
            'Receipt signatures are present but runtime ingestion treats them as advisory metadata until verification is configured.',
        });
      }

      dag = DAG.ingest(dag, envelope);
      return true;
    },

    hasFramesAfter(receiptId) {
      const ids = orderedFrameIds();
      if (ids.length === 0) {
        return false;
      }

      if (receiptId === null) {
        return ids.length > 0;
      }

      const index = ids.indexOf(receiptId);
      if (index === -1) {
        return false;
      }

      return index < ids.length - 1;
    },

    getFramesAfter(receiptId) {
      const ids = orderedFrameIds();
      if (receiptId === null) {
        return ids.map((id) => framesByReceipt.get(id)!).filter(Boolean);
      }
      const index = ids.indexOf(receiptId);
      if (index === -1) {
        return [];
      }
      return ids
        .slice(index + 1)
        .map((id) => framesByReceipt.get(id)!)
        .filter(Boolean);
    },

    latestReceiptId() {
      const ids = orderedFrameIds();
      return ids.length > 0 ? ids[ids.length - 1]! : null;
    },

    trustMode() {
      return 'advisory-unverified';
    },
  };
}
