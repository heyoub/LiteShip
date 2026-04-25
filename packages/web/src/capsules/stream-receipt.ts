/**
 * Capsule declaration wrapping the SSE morph + receipt flow as a
 * `receiptedMutation` instance. Proves the factory kernel against
 * a side-effecting op that emits an audit receipt per applied
 * stream message.
 *
 * @module
 */

import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';

const StreamMessageSchema = Schema.Struct({
  kind: Schema.Union([
    Schema.Literal('patch'),
    Schema.Literal('batch'),
    Schema.Literal('signal'),
    Schema.Literal('snapshot'),
  ]),
  payload: Schema.Unknown,
});

const ReceiptResultSchema = Schema.Struct({
  status: Schema.Union([
    Schema.Literal('applied'),
    Schema.Literal('skipped'),
    Schema.Literal('failed'),
  ]),
  receipt: Schema.Struct({
    messageId: Schema.String,
    appliedAt: Schema.Number,
    morphPath: Schema.optional(Schema.String),
  }),
});

/**
 * Declared capsule for the SSE stream receipt flow. Registered in the
 * module-level catalog at import time; walked by the factory compiler.
 */
export const streamReceiptCapsule = defineCapsule({
  _kind: 'receiptedMutation',
  name: 'web.stream.receipt',
  input: StreamMessageSchema,
  output: ReceiptResultSchema,
  capabilities: { reads: ['stream.incoming'], writes: ['dom.morph', 'receipt.ledger'] },
  invariants: [
    {
      name: 'receipt-accompanies-every-mutation',
      check: (
        _i: { kind: string; payload: unknown },
        o: { status: string; receipt: { messageId: string; appliedAt: number; morphPath?: string } },
      ): boolean => o.status !== 'applied' || typeof o.receipt.messageId === 'string',
      message: 'applied mutations must carry a receipt',
    },
  ],
  budgets: { p95Ms: 2 },
  site: ['node', 'browser'],
});
