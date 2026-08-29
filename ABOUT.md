# Inspiration

HairVault ERP already runs an 18-rule async fraud detection system across a
multi-branch hair product wholesale/retail business in Nigeria — it's real
production infrastructure, not a hackathon concept. But detection was never
the bottleneck. Every flagged transaction still needed a person to manually
pull branch history, cross-check the supplier, decide clear/reverse/escalate,
write the ledger note, and notify the right branch manager. That gap between
*flagged* and *resolved* is the actual friction, and it's the kind of messy,
multi-step chore the Taskmaster category is built for — so instead of
inventing a problem for the hackathon, we built the agent for the one that
was already sitting in production.

# What it does

When the existing fraud-detection queue flags a transaction, a Gemini 3.5
agent takes over the investigation end-to-end:

1. Pulls related branch transaction history
2. Checks the supplier's risk profile against prior incidents
3. Decides: clear, reverse, or escalate
4. Writes the resolution and its reasoning back to the ledger
5. Dispatches a branch-manager alert for reversed or escalated cases
6. Logs a full reasoning trace for audit

No human is in the loop until the alert lands. If a tool call fails or the
agent can't reach a confident decision, it escalates to a human instead of
guessing — designed to fail safe, not silent.

# How we built it

- **Gemini 3.5** via Vertex AI as the reasoning engine
- **Genkit**, Google's Node/TypeScript agent framework, chosen specifically
  so the agent runs inside the same NestJS process and dependency-injection
  graph as the rest of HairVault ERP — no separate Python service, no
  polyglot seam to maintain
- Four scoped tools (`getBranchHistory`, `checkSupplierRecord`,
  `updateLedger`, `dispatchAlert`), each a thin wrapper over one existing
  HairVault endpoint — no tool touches more than the single transaction,
  supplier, or branch it's called with
- **Cloud Run** hosts the agent as a private service, invoked only through
  an authenticated **Pub/Sub** push subscription — the existing BullMQ
  fraud-detection worker publishes to the topic on flag
- **Firestore** holds per-transaction run state, doubling as both the
  idempotency guard against Pub/Sub retries and the audit/reasoning log

# Challenges we ran into

When we packaged the agent core as a standalone SDK and ran a real
cold-install test — installing it into a completely separate project and
implementing a second adapter against it — the build surfaced that
`@genkit-ai/vertexai`, the Genkit plugin we'd built the whole service
around, is being deprecated in favor of `@genkit-ai/google-genai`. We
caught this by actually running `npm install` and `tsc` against the
packaged tarball rather than trusting the code looked right, which is
exactly the kind of gap a cold-install test is supposed to surface. We
migrated the plugin import, rebuilt, and reran the full install-and-compile
check against the fix before treating it as resolved.

The other genuine friction was field-name design: our first version of the
adapter interface used `branchId`/`supplierId`, which worked for HairVault
but silently assumed every ERP has a "branch" and a "supplier." We
renamed these to `subjectId`/`counterpartyId` so the interface doesn't
encode a specific business model, then verified a deliberately different
domain — a subscription-billing adapter with no branches or suppliers at
all — still satisfied the interface and compiled clean against the
published package shape.

A third gap turned up building the public demo app: `@nestjs/axios@^3.1.0`
declares a peer dependency that only goes up to NestJS v10, but the demo
was on v12 — `npm install` failed outright until we bumped it to
`@nestjs/axios@^12.0.0`. We only caught this because we actually ran
`npm install` and booted the server, rather than trusting the dependency
versions looked reasonable on paper.

The fourth, and most instructive, only showed up once we wired the real
HairVault adapter in and booted the service: NestJS's module encapsulation
meant importing `HttpModule` in the consuming app's `AppModule` did not
make `HttpService` visible inside `FraudAgentModule`'s own dynamic-module
injector, where the adapter actually gets constructed. Our mock adapter
never surfaced this because it has no constructor dependencies of its own
— it was only the real, HTTP-calling adapter that exposed the gap. We
fixed it by giving `forRoot()` an `imports` option so a consumer can pass
through whatever modules their adapter's dependencies need, then reran the
boot check on both the real agent service and the demo app to confirm
neither broke. This is the clearest example from the whole build of why a
cold, real boot test catches things a code review wouldn't.

# Accomplishments that we're proud of

We didn't just claim the agent is ERP-agnostic — we proved it. We packed
the core into a real installable tarball (the same artifact `npm publish`
produces), installed it cold into a project with no relationship to
HairVault's repo, wrote a second adapter for a completely different domain
(subscription billing instead of multi-branch retail), and confirmed
TypeScript accepts it against the package's interface and that the module
registers correctly at runtime.

# What we learned

*[Fill in once the agent has run against a real flagged transaction end to
end in HairVault ERP — this section is about the investigation/resolution
behavior itself, which we haven't exercised against production data yet.]*

# What's next

- Extend the same agent pattern to DesignFlow's purchase-order and vendor
  reconciliation workflow
- Add a second specialized agent for supplier-side anomaly detection,
  feeding into the same Firestore audit trail
- Expand the resolution schema beyond clear/reverse/escalate as more branch
  managers start relying on the alerts in production
