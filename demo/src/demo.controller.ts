import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { FraudAgentService } from 'fraud-agent-core';

interface DemoQuery {
  transactionId?: string;
  subjectId: string;
  counterpartyId: string;
  flagReason: string;
}

/**
 * SSE, not a synchronous POST — everything happens inside one long-lived
 * GET so there's no race between "agent starts" and "browser is
 * listening." Each tool_call/tool_result event lands the moment the
 * agent's tool wrapper emits it (see withProgress in fraud-agent-core),
 * not after the whole investigation finishes.
 */
@Controller('demo')
export class DemoController {
  constructor(private readonly agent: FraudAgentService) {}

  @Get('stream')
  async stream(@Query() query: DemoQuery, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const runId = randomUUID();
    const emitter = new EventEmitter();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    emitter.on('run_start', (e) => send('run_start', e));
    emitter.on('tool_call', (e) => send('tool_call', e));
    emitter.on('tool_result', (e) => send('tool_result', e));
    emitter.on('tool_error', (e) => send('tool_error', e));

    const payload = {
      transactionId: query.transactionId ?? `demo_txn_${Date.now()}`,
      subjectId: query.subjectId,
      counterpartyId: query.counterpartyId,
      flagReason: query.flagReason,
    };

    try {
      const result = await this.agent.investigateFlaggedTransaction(payload, { runId, emitter });
      send('run_complete', { runId, result });
    } catch (err) {
      send('error', { message: String(err) });
    } finally {
      res.end();
    }
  }
}
