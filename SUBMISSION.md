# Fraud Resolution Agent — Submission Text Description

## Category
Taskmaster

## Problem / friction (Bring Your Own Friction)
HairVault ERP the app that forment the inspiration; already runs an 18-rule async fraud detection system across a
multi-branch hair product wholesale/retail business in Nigeria. When a rule
fires, a human still has to manually pull branch transaction history, check
the supplier's risk profile, decide whether to clear, reverse, or escalate
the transaction, write the ledger note, and notify the right branch manager.
That investigation-and-resolution step — not the detection itself — is the
multi-step chore this agent takes over.

## What it does
A Gemini 3.5 agent, triggered the moment a transaction is flagged, autonomously:
1. Pulls related branch transaction history
2. Checks the supplier's risk profile against prior incidents
3. Decides: clear, reverse, or escalate
4. Writes the resolution and reasoning back to the ledger
5. Dispatches a branch-manager alert when the transaction is reversed or escalated
6. Logs a full reasoning trace to Firestore for audit

No human is in the loop until the alert lands. If a tool call fails or the
agent can't reach a confident decision, it escalates to a human rather than
guessing — it fails safe, not silent.

## Technologies used
- **Gemini 3.5** via Vertex AI
- **Genkit** (Google Agent Framework) — chosen over ADK/Python so the agent
  runs inside the same NestJS process and dependency-injection graph as the
  rest of HairVault ERP, rather than a separate polyglot service
- **Google Cloud Run** — private service, invoked only via an authenticated
  Pub/Sub push subscription
- **Cloud Pub/Sub** — decouples the existing BullMQ fraud-detection queue
  from the agent
- **Firestore** — per-transaction run state and audit/reasoning log,
  idempotent against Pub/Sub retries
- **NestJS + PostgreSQL** (existing HairVault stack) — the tools the agent
  calls are scoped, single-purpose wrappers over existing endpoints

## Architecture
[Insert the architecture diagram here — flagged transaction → BullMQ →
Pub/Sub → Gemini agent orchestrator (Cloud Run) → four scoped tools →
Firestore audit log + ledger update + branch alert.]

## Disclosure of pre-existing work
HairVault ERP — including its fraud-detection queue, transaction API, and
Postgres schema — is an existing internal system built prior to the
Submission Period. It is used here as the environment the agent operates
in, not as submitted work. The Project submitted for this Contest — the
Gemini/Genkit agent, its tool definitions, the Pub/Sub-triggered Cloud Run
service, the Firestore audit logging, and the deployment configuration —
was built entirely during the Submission Period (August 2026). The
submitted GitHub repository is scoped to this new agent code; HairVault
ERP's own source is referenced only as an external API dependency, in the
same way a Taskmaster agent might integrate with an existing calendar or
email account.

