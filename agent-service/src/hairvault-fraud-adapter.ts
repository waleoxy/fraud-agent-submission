import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { FraudAgentAdapter } from 'fraud-agent-core';

/**
 * HairVault ERP (multi-branch wholesale/retail): subjectId = branchId,
 * counterpartyId = supplierId. This service talks to HairVault only
 * over HTTP via HAIRVAULT_API_URL — it does not live inside HairVault's
 * own repo or share its codebase.
 */
@Injectable()
export class HairVaultFraudAdapter implements FraudAgentAdapter {
  private readonly baseUrl = process.env.HAIRVAULT_API_URL;

  constructor(private readonly http: HttpService) {}

  async getRelatedHistory(input: { transactionId: string; subjectId: string }) {
    const { data } = await firstValueFrom(
      this.http.get(`${this.baseUrl}/branches/${input.subjectId}/transactions`, {
        params: { relatedTo: input.transactionId, limit: 25 },
      }),
    );
    return data;
  }

  async checkCounterpartyRecord(input: { counterpartyId: string }) {
    const { data } = await firstValueFrom(
      this.http.get(`${this.baseUrl}/suppliers/${input.counterpartyId}/risk-profile`),
    );
    return data;
  }

  async updateLedger(input: {
    transactionId: string;
    resolution: 'cleared' | 'reversed' | 'escalated';
    note: string;
  }) {
    const { data } = await firstValueFrom(
      this.http.patch(`${this.baseUrl}/transactions/${input.transactionId}/resolution`, {
        resolution: input.resolution,
        note: input.note,
        resolvedBy: 'fraud-resolution-agent',
      }),
    );
    return data;
  }

  async dispatchAlert(input: { subjectId: string; severity: 'low' | 'medium' | 'high'; summary: string }) {
    const { data } = await firstValueFrom(
      this.http.post(`${this.baseUrl}/notifications/branch-alert`, {
        branchId: input.subjectId,
        severity: input.severity,
        summary: input.summary,
      }),
    );
    return data;
  }
}
