# Fraud Resolution Agent — full build & integration walkthrough

Assumes: HairVault ERP is a NestJS monorepo with a root `AppModule`, an
existing BullMQ fraud-detection processor, and you have `gcloud` CLI
installed and authenticated (`gcloud auth login`). Adjust paths to match
your actual repo structure.

---

## 0. Prerequisites (do once)

```bash
# Confirm tools are installed
node -v          # need 20.x
npm -v
gcloud --version

# Authenticate gcloud
gcloud auth login
gcloud auth application-default login   # needed for local Vertex AI calls

# Set your project
gcloud config set project YOUR_PROJECT_ID
```

Go request the $150 Cloud credit form now if you haven't — deadline is
Aug 28, 12PM PT: https://forms.gle/riGhgDSHkHeMx8Ca6

---

## 1. Set up the workspace and install the package

The agent core is now a real package: `packages/fraud-agent-core`, with
its own `package.json`, builds to `dist/` with type declarations, and is
consumed by `npm install` — not copy-pasted source files.

If HairVault ERP isn't already an npm workspace monorepo, make it one so
`fraud-agent-core` can live alongside the API app and be linked locally
without publishing yet:

```bash
cd /path/to/hairvault-erp
```

Add to the **root** `package.json`:

```json
{
  "workspaces": ["packages/*", "apps/*"]
}
```

Copy `packages/fraud-agent-core` (the whole folder — `package.json`,
`tsconfig.json`, `src/`, `README.md`) into your repo's `packages/`
directory, then from the repo root:

```bash
npm install        # links fraud-agent-core into node_modules via the workspace
npm run build -w packages/fraud-agent-core
```

Copy the two adapter files into your API app (not into the package):
- `examples-adapters/hairvault-fraud-adapter.ts` → your app's `src/fraud-agent/adapters/`
- `examples-adapters/subscription-billing-fraud-adapter.ts` is a reference only — proof the interface generalizes, not something HairVault needs to deploy

And the Dockerfile + deploy.sh to your app root (next to your existing
`package.json`, not inside `src/`).

**Not using workspaces / prefer a real registry instead:** publish the
package to GitHub Packages (`npm publish` with a scoped registry in
`.npmrc`, keeping `"private": true` if it should stay internal), then
`npm install fraud-agent-core` in the API app like any other dependency.
Workspaces are faster to get running today; a published package is the
right call once a second team is consuming it.

---

## 2. Install the app-level dependencies

`fraud-agent-core` already declares `genkit`, `@genkit-ai/vertexai`, and
`@google-cloud/firestore` as its own dependencies — you don't install
those in the API app anymore. The app only needs what its own
adapter/processor files use directly:

```bash
npm install @nestjs/axios axios @google-cloud/pubsub reflect-metadata
```

If your project already has `@nestjs/bull` and `bull` for your existing
fraud-detection queue, you don't need to reinstall those — the
`FraudFlagPublisher` processor reuses them.

---

## 3. Wire the module into your app

Open your root `app.module.ts` and register the package's module with the
HairVault adapter via `forRoot()` — `fraud-agent-core` is now imported by
package name, the same as any other npm dependency:

```typescript
import { HttpModule } from '@nestjs/axios';
import { FraudAgentModule } from 'fraud-agent-core';
import { HairVaultFraudAdapter } from './fraud-agent/adapters/hairvault-fraud-adapter';

@Module({
  imports: [
    // ...your existing imports
    HttpModule,
    FraudAgentModule.forRoot({ adapter: HairVaultFraudAdapter }),
  ],
})
export class AppModule {}
```

`forRoot()` registers the adapter, the agent service, and the Pub/Sub
controller (`/fraud-agent/healthz`, `/fraud-agent/events`) all at once —
you don't wire the controller separately.

Register the publisher processor in whichever module currently declares
your fraud-detection BullMQ queue (wherever `@Processor('fraud-detection')`
already lives for your existing rule engine):

```typescript
import { FraudFlagPublisher } from '../fraud-agent/fraud-flag-publisher.processor';

@Module({
  // ...
  providers: [
    // ...existing providers
    FraudFlagPublisher,
  ],
})
export class FraudDetectionModule {}
```

Find where your existing 18-rule engine enqueues a flag and confirm it
uses job name `'flag-transaction'` on queue `'fraud-detection'` with a
payload shaped like:

```typescript
{ transactionId: string, branchId: string, supplierId: string, flagReason: string }
```

`FraudFlagPublisher` translates this into the package's generalized event
shape (`subjectId`/`counterpartyId`) before publishing — that translation
is the only place your existing field names need to meet the package's
field names. If your existing job name or payload differs, edit the
`@Process(...)` decorator and the destructuring in
`fraud-flag-publisher.processor.ts` to match — don't change your existing
rule engine to match this file.

---

## 4. Set environment variables

Create or edit `.env` (local) and note these for Cloud Run later:

```bash
GOOGLE_GENAI_USE_VERTEXAI=true
GCP_REGION=us-central1
GOOGLE_CLOUD_PROJECT=your-gcp-project
HAIRVAULT_API_URL=http://localhost:3000   # your actual API base URL
FRAUD_AGENT_TOPIC=fraud-agent-events
```

---

## 5. Test locally before touching Pub/Sub

Start the app:

```bash
npm run start:dev
```

In another terminal, hit the health check:

```bash
curl http://localhost:3000/fraud-agent/healthz
# {"status":"ok"}
```

Manually simulate a Pub/Sub push (base64-encode a fake payload yourself,
skipping real Pub/Sub for this step):

```bash
PAYLOAD=$(echo -n '{"transactionId":"txn_test_1","subjectId":"branch_1","counterpartyId":"sup_1","flagReason":"unusual quantity"}' | base64)

curl -X POST http://localhost:3000/fraud-agent/events \
  -H "Content-Type: application/json" \
  -d "{\"message\":{\"data\":\"$PAYLOAD\",\"messageId\":\"local-test-1\"},\"subscription\":\"local\"}"
```

Watch the terminal logs — you should see the agent call each tool in turn,
then a Firestore write. Check Firestore console for a `fraudAgentRuns/txn_test_1`
document. Fix any errors here (missing env vars, wrong `HAIRVAULT_API_URL`,
auth issues) before deploying — much faster to iterate locally.

Common local error: `PERMISSION_DENIED` on Vertex AI calls means
`gcloud auth application-default login` wasn't run, or your account lacks
the Vertex AI User role on the project.

---

## 6. Deploy to Cloud Run

Edit the four variables at the top of `deploy.sh`:

```bash
PROJECT_ID="your-gcp-project"
REGION="us-central1"
SERVICE_NAME="fraud-agent"
HAIRVAULT_API_URL="https://your-real-api.example.com"
```

Run it from the directory containing your `Dockerfile`:

```bash
chmod +x deploy.sh
./deploy.sh
```

This takes a few minutes — it builds via Cloud Build, deploys as a private
Cloud Run service, creates the runtime and Pub/Sub-invoker service
accounts, and creates the topic + push subscription. It prints the
service URL and a health-check command at the end.

Verify:

```bash
gcloud run services describe fraud-agent --region us-central1 \
  --format="value(status.url, status.conditions[0].status)"
```

---

## 7. End-to-end test against the deployed service

Publish a real message to the topic:

```bash
gcloud pubsub topics publish fraud-agent-events \
  --message='{"transactionId":"txn_real_1","subjectId":"branch_1","counterpartyId":"sup_1","flagReason":"unusual quantity"}'
```

Check three places:

```bash
# Cloud Run logs — confirm the agent ran and which tools it called
gcloud run services logs read fraud-agent --region us-central1 --limit 50

# Firestore — confirm the run document and its resolution
gcloud firestore export gs://your-bucket/firestore-check --collection-ids=fraudAgentRuns
# or just check the console: https://console.cloud.google.com/firestore

# Your actual HairVault ledger and notification channel — confirm the
# transaction's resolution field was updated and the alert arrived
```

If the subscription shows repeated redelivery, check `gcloud pubsub
subscriptions describe fraud-agent-push-sub` for the ack deadline and
look at Cloud Run logs for a non-2xx response — that's usually a thrown
error inside `investigateFlaggedTransaction`.

---

## 9. Publish the package for real (do this if you have the time)

A workspace-linked package proves the decoupling works inside one repo.
Publishing it proves a second team could actually consume it.

```bash
cd packages/fraud-agent-core

# GitHub Packages (fastest path, can stay private)
npm login --registry=https://npm.pkg.github.com
# add to package.json: "publishConfig": { "registry": "https://npm.pkg.github.com" }
npm publish
```

Then in a *separate* throwaway NestJS project (not HairVault), prove the
install path works cold:

```bash
npm install fraud-agent-core
```

Wire in `SubscriptionBillingFraudAdapter` from `examples-adapters/` against
that throwaway project — it doesn't need real billing endpoints, just
enough to show the interface accepts a second, differently-shaped domain
without changing `fraud-agent-core` itself. This is your strongest evidence
against "is this actually generic or just claimed" — screen-record it for
a few seconds in the demo video alongside the HairVault run.

---

## 10. Finish the written submission

Once step 7 has actually run successfully at least once:

- Fill in **Challenges we ran into**, **Accomplishments**, and **What we
  learned** in `ABOUT.md` with what genuinely happened (a flaky tool call,
  a prompt tweak that fixed a bad decision, latency numbers, etc.) — and
  if you did step 9, the second-adapter proof is a genuine accomplishment
  worth naming explicitly
- Drop the architecture diagram into `SUBMISSION.md`
- Write the README spin-up instructions from the exact commands in
  sections 1–7 above, since you now know they work
- Fill in real testing credentials/instructions in `SUBMISSION.md`

---

## 11. Record and submit

- Screen-record: the `gcloud pubsub topics publish` command firing → Cloud
  Run logs streaming live → the Firestore document appearing → the ledger
  update → the alert landing → a few seconds on the Cloud Run dashboard →
  (if done) the second adapter proving the package installs and runs
  against a different domain shape
- Keep it under 4 minutes, unedited, upload to YouTube or Vimeo (public)
- Submit on Devpost: category, repo link, hosted URL, text description,
  video link — well before Aug 31, 5PM PT
