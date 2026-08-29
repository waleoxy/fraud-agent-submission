import { Body, Controller, Get, HttpCode, Logger, Post } from '@nestjs/common';
import { Firestore } from '@google-cloud/firestore';
import { FraudAgentService } from './fraud-agent.service';

interface PubSubPushBody {
  message: { data: string; messageId: string };
  subscription: string;
}

@Controller('fraud-agent')
export class FraudAgentController {
  private readonly logger = new Logger(FraudAgentController.name);
  private readonly firestore = new Firestore();

  constructor(private readonly agent: FraudAgentService) {}

  @Get('healthz')
  health() {
    return { status: 'ok' };
  }

  @Post('events')
  @HttpCode(204)
  async handlePubSubPush(@Body() body: PubSubPushBody) {
    const payload = JSON.parse(Buffer.from(body.message.data, 'base64').toString('utf8'));
    const runRef = this.firestore.collection('fraudAgentRuns').doc(payload.transactionId);

    const existing = await runRef.get();
    if (existing.exists && existing.data()?.status === 'resolved') {
      this.logger.warn(`Duplicate delivery for ${payload.transactionId}, skipping`);
      return;
    }

    await runRef.set({ status: 'in_progress', startedAt: new Date().toISOString() }, { merge: true });

    try {
      const result = await this.agent.investigateFlaggedTransaction(payload);
      await runRef.set(
        { status: 'resolved', result, resolvedAt: new Date().toISOString() },
        { merge: true },
      );
    } catch (err) {
      this.logger.error(`Agent run failed for ${payload.transactionId}`, err);
      await runRef.set(
        { status: 'failed', error: String(err), failedAt: new Date().toISOString() },
        { merge: true },
      );
      throw err;
    }
  }
}
