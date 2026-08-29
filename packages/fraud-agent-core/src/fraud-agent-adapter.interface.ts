/**
 * Any ERP that wants autonomous fraud investigation implements this
 * interface. Field names are deliberately domain-neutral, not tied to
 * a retail/branch model:
 *
 *   subjectId      — the internal unit the transaction belongs to
 *                     (a branch, a store, an account, a department —
 *                     whatever "location" means in your ERP)
 *   counterpartyId — the external party on the other side of the
 *                     transaction (a supplier, a vendor, a payer,
 *                     a payment processor)
 *
 * The agent core never references "branch" or "supplier" directly —
 * only these two adapter methods and the resolution/alert methods.
 */
export interface FraudAgentAdapter {
  getRelatedHistory(input: { transactionId: string; subjectId: string }): Promise<unknown>;
  checkCounterpartyRecord(input: { counterpartyId: string }): Promise<unknown>;
  updateLedger(input: {
    transactionId: string;
    resolution: 'cleared' | 'reversed' | 'escalated';
    note: string;
  }): Promise<unknown>;
  dispatchAlert(input: {
    subjectId: string;
    severity: 'low' | 'medium' | 'high';
    summary: string;
  }): Promise<unknown>;
}

export const FRAUD_AGENT_ADAPTER = Symbol('FRAUD_AGENT_ADAPTER');
