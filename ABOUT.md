## Inspiration
HairVault ERP already runs an 18-rule async fraud detection system across a multi-branch hair product wholesale/retail business in Nigeria — it's real production infrastructure, not a hackathon concept. But detection was never the bottleneck. Every flagged transaction still needed a person to manually pull branch history, cross-check the supplier, decide clear/reverse/escalate, write the ledger note, and notify the right branch manager. That gap between flagged and resolved is the actual friction, and it's the kind of messy, multi-step chore the Taskmaster category is built for — so instead of inventing a problem for the hackathon, we built the agent for the one that was already sitting in production.

## What it does
When the existing fraud-detection queue flags a transaction, a Gemini 3.5 agent takes over the investigation end-to-end:
Pulls related branch transaction history
Checks the supplier's risk profile against prior incidents
Decides: clear, reverse, or escalate
Writes the resolution and its reasoning back to the ledger
Dispatches a branch-manager alert for reversed or escalated cases
Logs a full reasoning trace for audit
No human is in the loop until the alert lands. If a tool call fails or the agent can't reach a confident decision, it escalates to a human instead of guessing — designed to fail safe, not silent.

## How we built it
Gemini 3.5 via Vertex AI as the reasoning engine
Genkit, Google's Node/TypeScript agent framework, chosen specifically so the agent runs inside the same NestJS process and dependency-injection graph as the rest of HairVault ERP — no separate Python service, no polyglot seam to maintain
Four scoped tools (getBranchHistory, checkSupplierRecord, updateLedger, dispatchAlert), each a thin wrapper over one existing HairVault endpoint — no tool touches more than the single transaction, supplier, or branch it's called with
Cloud Run hosts the agent as a private service, invoked only through an authenticated Pub/Sub push subscription — the existing BullMQ fraud-detection worker publishes to the topic on flag
Firestore holds per-transaction run state, doubling as both the idempotency guard against Pub/Sub retries and the audit/reasoning log

## Challenges we ran into
A genuine friction we met was field-name design: our first version of the adapter interface used branchId/supplierId, which worked for HairVault but silently assumed every ERP has a "branch" and a "supplier." We renamed these to subjectId/counterpartyId so the interface doesn't encode a specific business model, then verified a deliberately different domain — a subscription-billing adapter with no branches or suppliers at all — still satisfied the interface and compiled clean against the published package shape.

Another gap turned up building the public demo app: @nestjs/axios@^3.1.0 declares a peer dependency that only goes up to NestJS v10, but the demo was on v12 — npm install failed outright until we bumped it to @nestjs/axios@^12.0.0. We only caught this because we actually ran npm install and booted the server, rather than trusting the dependency versions looked reasonable on paper.

Again, and most instructive, only showed up once we wired the real HairVault adapter in and booted the service: NestJS's module encapsulation meant importing HttpModule in the consuming app's AppModule did not make HttpService visible inside FraudAgentModule's own dynamic-module injector, where the adapter actually gets constructed. Our mock adapter never surfaced this because it has no constructor dependencies of its own — it was only the real, HTTP-calling adapter that exposed the gap. We fixed it by giving forRoot() an imports option so a consumer can pass through whatever modules their adapter's dependencies need, then reran the boot check on both the real agent service and the demo app to confirm neither broke. This is the clearest example from the whole build of why a cold, real boot test catches things a code review wouldn't.

## Accomplishments that we're proud of
We didn't just claim the agent is ERP-agnostic — we proved it. We packed the core into a real installable(the same artifact npm publish produces), installed it cold into a project with no relationship to HairVault's repo, wrote a second adapter for a completely different domain (subscription billing instead of multi-branch retail), and confirmed TypeScript accepts it against the package's interface and that the module registers correctly at runtime.

## What we learned
The first clean end-to-end run told us more than we expected about how the agent actually reasons. Given a flagged transaction with a plausible but generic flag reason ("unusual quantity ordered right before month-end close"), it called both getRelatedHistory and checkCounterpartyRecord before deciding anything — it didn't jump to a conclusion off the flag reason alone. It then correctly weighted a specific prior incident (a NGN15,400 transaction reversed for a quantity mismatch, over 10x the account's average transaction value) as the deciding factor, connected it to the current flag's timing, and combined it with the counterparty's medium risk score to reach "escalated" — with reasoning that named the specific numbers and dates it was acting on, not a generic justification. It also correctly followed the instruction to dispatch an alert only for reversed/escalated cases, and wrote exactly one ledger update, matching the "call updateLedger exactly once" rule in the prompt. What we hadn't verified until this run was whether a general instruction like that would actually hold under real model behavior rather than just being present in the prompt — it did.

## What's next for HairVault Fraud Resolution Agent
Extend the same agent pattern to other Apps with purchase-order and vendor reconciliation workflow
Add a second specialized agent for supplier-side anomaly detection, feeding into the same Firestore audit trail
Expand the resolution schema beyond clear/reverse/escalate as more branch managers start relying on the alerts in production
