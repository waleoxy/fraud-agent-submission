# Fraud Resolution Agent

An autonomous, ERP-agnostic fraud investigation agent. Built with Gemini
3.6 (via Vertex AI) and Genkit. When a fraud rule flags a transaction,
this agent investigates it, decides a resolution, writes it back, and
alerts the right person — with no human step in between.

Built for the Taskmaster category of the All Things Agentic Hackathon.

## Try it

- **Live public demo** (no login required, safe fabricated data): https://fraud-agent-demo-mpftibd4jq-uc.a.run.app/
- **Architecture diagram**: [`architecture-diagram.svg`](./architecture-diagram.svg)
- **Full write-up**: see [`ABOUT.md`](./ABOUT.md) for inspiration, architecture, and what we learned building this

## Repo layout

- [`packages/fraud-agent-core`](./packages/fraud-agent-core) — the published SDK ([npm](https://www.npmjs.com/package/fraud-agent-core)). ERP-agnostic: implement one adapter interface, plug into any ERP shaped roughly like a multi-branch business with internal units and external counterparties.
- [`agent-service`](./agent-service) — the real production service: `fraud-agent-core` wired to a HairVault ERP adapter, deployed privately on Cloud Run, triggered by Pub/Sub.
- [`demo`](./demo) — a public, credential-free demo: the same core SDK wired to a mock adapter with fabricated data, with a live browser UI that streams each tool call as the agent investigates.
- [`examples`](./examples) — a second reference adapter (subscription billing, not retail) proving the adapter interface generalizes beyond HairVault's domain shape.

## Documentation

- [`SUBMISSION.md`](./SUBMISSION.md) — category, technologies, disclosure of pre-existing work, testing instructions
- [`ABOUT.md`](./ABOUT.md) — inspiration, what it does, how it was built, challenges, accomplishments, what we learned
- [`WALKTHROUGH.md`](./WALKTHROUGH.md) — full build/deploy walkthrough, command by command

## Disclosure

This project integrates with HairVault ERP, an existing internal system
(fraud-detection queue, transaction API) built prior to the Submission
Period. HairVault ERP's own source is not included in this repo — it is
referenced only as an external API dependency. Everything in this repo —
the SDK, the adapters, the agent service, and the demo — was built during
the Submission Period.
