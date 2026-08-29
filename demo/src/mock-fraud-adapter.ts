import { Injectable } from '@nestjs/common';
import { FraudAgentAdapter } from 'fraud-agent-core';

/**
 * Safe for public use. Returns realistic but entirely fake data — no
 * database, no auth, no connection to HairVault or any real system.
 * This is what a judge's browser talks to; the real Gemini/Vertex AI
 * call still happens for real, only the ERP-side data is fabricated.
 */
@Injectable()
export class MockFraudAdapter implements FraudAgentAdapter {
  async getRelatedHistory(input: { transactionId: string; subjectId: string }) {
    return {
      subjectId: input.subjectId,
      recentTransactions: [
        { id: 'txn_0091', amount: 1250, date: '2026-08-20', status: 'cleared' },
        { id: 'txn_0088', amount: 980, date: '2026-08-18', status: 'cleared' },
        { id: 'txn_0071', amount: 15400, date: '2026-08-11', status: 'reversed', note: 'quantity mismatch on delivery' },
      ],
      averageTransactionValue: 1400,
      flaggedInLast90Days: 2,
    };
  }

  async checkCounterpartyRecord(input: { counterpartyId: string }) {
    return {
      counterpartyId: input.counterpartyId,
      yearsActive: 3,
      priorIncidents: 1,
      riskScore: 'medium',
      lastIncident: { date: '2026-05-02', type: 'delayed delivery, no fraud confirmed' },
    };
  }

  async updateLedger(input: { transactionId: string; resolution: string; note: string }) {
    return { written: true, transactionId: input.transactionId, resolution: input.resolution, note: input.note };
  }

  async dispatchAlert(input: { subjectId: string; severity: string; summary: string }) {
    return { sent: true, channel: 'demo-console', ...input };
  }
}
