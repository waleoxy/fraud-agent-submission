import { Inject, Injectable, Logger } from '@nestjs/common';
import { genkit, z } from 'genkit';
import { vertexAI } from '@genkit-ai/google-genai';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { FRAUD_AGENT_ADAPTER, FraudAgentAdapter } from './fraud-agent-adapter.interface';
import { runContext } from './run-context';

const ai = genkit({
  plugins: [vertexAI({ location: process.env.GCP_REGION ?? 'us-central1' })],
  model: vertexAI.model('gemini-3.5-pro'),
});

const ResolutionSchema = z.object({
  resolution: z.enum(['cleared', 'reversed', 'escalated']),
  reasoning: z.string(),
  alertSent: z.boolean(),
});

/**
 * Wraps a tool implementation so it emits `tool_call` before running and
 * `tool_result` (or `tool_error`) after — but only if the current async
 * context has a listener attached. Callers that never pass a runId pay
 * no cost: the emit calls just no-op against an absent context.
 */
function withProgress<TInput, TOutput>(
  name: string,
  impl: (input: TInput) => Promise<TOutput>,
) {
  return async (input: TInput): Promise<TOutput> => {
    const ctx = runContext.getStore();
    ctx?.emitter.emit('tool_call', { runId: ctx.runId, tool: name, input });
    try {
      const output = await impl(input);
      ctx?.emitter.emit('tool_result', { runId: ctx.runId, tool: name, output });
      return output;
    } catch (err) {
      ctx?.emitter.emit('tool_error', { runId: ctx.runId, tool: name, error: String(err) });
      throw err;
    }
  };
}

/**
 * Fully ERP-agnostic. No import, field name, or string literal in this
 * file refers to any specific ERP's domain model — only the adapter
 * interface. This is the file a second ERP integration never touches.
 */
@Injectable()
export class FraudAgentService {
  private readonly logger = new Logger(FraudAgentService.name);

  constructor(@Inject(FRAUD_AGENT_ADAPTER) private readonly adapter: FraudAgentAdapter) {}

  private getRelatedHistoryTool = ai.defineTool(
    {
      name: 'getRelatedHistory',
      description: 'Look up recent related transaction history for the subject tied to a flagged transaction',
      inputSchema: z.object({ transactionId: z.string(), subjectId: z.string() }),
      outputSchema: z.any(),
    },
    withProgress('getRelatedHistory', (input) => this.adapter.getRelatedHistory(input)),
  );

  private checkCounterpartyRecordTool = ai.defineTool(
    {
      name: 'checkCounterpartyRecord',
      description: 'Fetch the risk profile and prior incident history for the counterparty on the transaction',
      inputSchema: z.object({ counterpartyId: z.string() }),
      outputSchema: z.any(),
    },
    withProgress('checkCounterpartyRecord', (input) => this.adapter.checkCounterpartyRecord(input)),
  );

  private updateLedgerTool = ai.defineTool(
    {
      name: 'updateLedger',
      description: 'Write the final resolution back to the transaction ledger. Call exactly once, at the end.',
      inputSchema: z.object({
        transactionId: z.string(),
        resolution: z.enum(['cleared', 'reversed', 'escalated']),
        note: z.string(),
      }),
      outputSchema: z.any(),
    },
    withProgress('updateLedger', (input) => this.adapter.updateLedger(input)),
  );

  private dispatchAlertTool = ai.defineTool(
    {
      name: 'dispatchAlert',
      description: 'Notify the responsible party when a transaction is reversed or escalated. Skip for cleared cases.',
      inputSchema: z.object({
        subjectId: z.string(),
        severity: z.enum(['low', 'medium', 'high']),
        summary: z.string(),
      }),
      outputSchema: z.any(),
    },
    withProgress('dispatchAlert', (input) => this.adapter.dispatchAlert(input)),
  );

  /**
   * `progress`, if passed, gets `tool_call` / `tool_result` / `tool_error`
   * events for this run (each tagged with `runId`) plus `run_start` and
   * `run_complete`. Entirely optional — omit it and this behaves exactly
   * as before, no streaming, just the final resolution.
   */
  async investigateFlaggedTransaction(
    event: {
      transactionId: string;
      subjectId: string;
      counterpartyId: string;
      flagReason: string;
    },
    progress?: { runId?: string; emitter: EventEmitter },
  ) {
    const runId = progress?.runId ?? randomUUID();
    this.logger.log(`Investigating transaction ${event.transactionId} (run ${runId})`);

    const run = async () => {
      progress?.emitter.emit('run_start', { runId, event });

      const { output } = await ai.generate({
        prompt: `A fraud rule flagged transaction ${event.transactionId} (subject
${event.subjectId}, counterparty ${event.counterpartyId}). Flag reason: "${event.flagReason}".

Investigate using the available tools: pull related history, check the
counterparty's risk profile, and decide whether this transaction should be
cleared, reversed, or escalated. If you reverse or escalate, dispatch an
alert. Always call updateLedger exactly once at the end with your decision
and reasoning. If any tool call fails or you cannot reach a confident
decision after investigating, escalate rather than guessing.`,
        tools: [
          this.getRelatedHistoryTool,
          this.checkCounterpartyRecordTool,
          this.updateLedgerTool,
          this.dispatchAlertTool,
        ],
        output: { schema: ResolutionSchema },
      });

      progress?.emitter.emit('run_complete', { runId, result: output });
      return output;
    };

    return progress ? runContext.run({ runId, emitter: progress.emitter }, run) : run();
  }
}

