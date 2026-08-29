import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { FraudAgentAdapter } from 'fraud-agent-core';

/**
 * Reference implementation for a subscription billing ERP — deliberately
 * a different shape than HairVault's branch/supplier retail model, to
 * demonstrate the adapter interface holds up under a second domain:
 *
 *   subjectId      = accountId        (the customer account being billed)
 *   counterpartyId = paymentMethodId  (the card/bank method on file)
 *
 * Not wired into any real system — this is a proof-of-genericity
 * reference, meant to be swapped for real endpoints by whoever adopts
 * the package for a billing-shaped ERP.
 */
@Injectable()
export class SubscriptionBillingFraudAdapter implements FraudAgentAdapter {
  private readonly baseUrl = process.env.BILLING_API_URL;

  constructor(private readonly http: HttpService) {}

  async getRelatedHistory(input: { transactionId: string; subjectId: string }) {
    const { data } = await firstValueFrom(
      this.http.get(`${this.baseUrl}/accounts/${input.subjectId}/charges`, {
        params: { relatedTo: input.transactionId, limit: 25 },
      }),
    );
    return data;
  }

  async checkCounterpartyRecord(input: { counterpartyId: string }) {
    const { data } = await firstValueFrom(
      this.http.get(`${this.baseUrl}/payment-methods/${input.counterpartyId}/risk-signals`),
    );
    return data;
  }

  async updateLedger(input: {
    transactionId: string;
    resolution: 'cleared' | 'reversed' | 'escalated';
    note: string;
  }) {
    const { data } = await firstValueFrom(
      this.http.patch(`${this.baseUrl}/charges/${input.transactionId}/resolution`, {
        resolution: input.resolution,
        note: input.note,
        resolvedBy: 'fraud-resolution-agent',
      }),
    );
    return data;
  }

  async dispatchAlert(input: { subjectId: string; severity: 'low' | 'medium' | 'high'; summary: string }) {
    const { data } = await firstValueFrom(
      this.http.post(`${this.baseUrl}/notifications/account-alert`, {
        accountId: input.subjectId,
        severity: input.severity,
        summary: input.summary,
      }),
    );
    return data;
  }
}
