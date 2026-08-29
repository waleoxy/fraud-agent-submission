import { AsyncLocalStorage } from 'node:async_hooks';
import { EventEmitter } from 'node:events';

export interface RunContext {
  runId: string;
  emitter: EventEmitter;
}

/**
 * Genkit's tool-calling loop only passes tools their declared input
 * schema — there's no channel to hand a per-request emitter through
 * that call chain directly. AsyncLocalStorage carries it implicitly
 * across the async execution of a single investigateFlaggedTransaction
 * call, so each tool wrapper can look up "who's listening to *this*
 * run" without the model ever knowing progress events exist.
 */
export const runContext = new AsyncLocalStorage<RunContext>();
