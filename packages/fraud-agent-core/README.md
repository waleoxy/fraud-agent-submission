# fraud-agent-core

An ERP-agnostic, autonomous fraud investigation agent. Powered by Gemini
3.5 via Vertex AI, built with Genkit. Implement one interface, get an
agent that investigates flagged transactions, decides a resolution, writes
it back, and alerts the right person — with zero human steps in between.

## Install

```bash
npm install fraud-agent-core
```

Peer dependencies your app must already have: `@nestjs/common`, `reflect-metadata`.

## What you implement

Four methods against your own ERP's API:

```typescript
import { FraudAgentAdapter } from 'fraud-agent-core';

export class MyErpFraudAdapter implements FraudAgentAdapter {
  async getRelatedHistory(input: { transactionId: string; subjectId: string }) { /* ... */ }
  async checkCounterpartyRecord(input: { counterpartyId: string }) { /* ... */ }
  async updateLedger(input: { transactionId: string; resolution: 'cleared' | 'reversed' | 'escalated'; note: string }) { /* ... */ }
  async dispatchAlert(input: { subjectId: string; severity: 'low' | 'medium' | 'high'; summary: string }) { /* ... */ }
}
```

`subjectId` is whatever "internal unit" means in your ERP — a branch, a
store, an account, a department. `counterpartyId` is whoever's on the
other side of the transaction — a supplier, a vendor, a payer.

## Register it

```typescript
import { FraudAgentModule } from 'fraud-agent-core';
import { MyErpFraudAdapter } from './my-erp-fraud-adapter';

@Module({
  imports: [FraudAgentModule.forRoot({ adapter: MyErpFraudAdapter })],
})
export class AppModule {}
```

This registers the agent service and two HTTP endpoints:
- `GET /fraud-agent/healthz`
- `POST /fraud-agent/events` — a Pub/Sub push endpoint. Point a Pub/Sub
  subscription at it with a payload shaped like:

```json
{ "transactionId": "...", "subjectId": "...", "counterpartyId": "...", "flagReason": "..." }
```

## What it does

1. Pulls related history for the subject
2. Checks the counterparty's risk profile
3. Decides: clear, reversed, or escalated
4. Writes the resolution back via `updateLedger`
5. Dispatches an alert for reversed/escalated cases
6. Logs a full run + reasoning trace to Firestore (`fraudAgentRuns` collection)

If a tool call fails or the agent can't reach a confident decision, it
escalates rather than guessing.

## Reference adapters

See `examples/` in the source repo for two working implementations against
very different domain shapes — a multi-branch retail ERP and a subscription
billing system — as evidence the interface generalizes beyond one business model.
