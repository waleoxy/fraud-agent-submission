#!/usr/bin/env bash
set -euo pipefail

# Deploys the REAL agent — HairVaultFraudAdapter, talks to your actual
# HairVault API. Private service, invoked only via an authenticated
# Pub/Sub push subscription. Separate from fraud-agent-demo on purpose.

PROJECT_ID="your-gcp-project"
REGION="us-central1"
SERVICE_NAME="fraud-agent"
TOPIC_NAME="fraud-agent-events"
SUBSCRIPTION_NAME="fraud-agent-push-sub"
HAIRVAULT_API_URL="https://api.hairvault.example.com"

gcloud config set project "$PROJECT_ID"

gcloud services enable \
  run.googleapis.com \
  aiplatform.googleapis.com \
  pubsub.googleapis.com \
  firestore.googleapis.com \
  cloudbuild.googleapis.com

gcloud firestore databases create --location="$REGION" || true

gcloud iam service-accounts create fraud-agent-runtime \
  --display-name="Fraud agent runtime" || true
RUNTIME_SA="fraud-agent-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" --role="roles/aiplatform.user"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" --role="roles/datastore.user"

gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --service-account "$RUNTIME_SA" \
  --no-allow-unauthenticated \
  --set-env-vars "GOOGLE_GENAI_USE_VERTEXAI=true,GCP_REGION=${REGION},GOOGLE_CLOUD_PROJECT=${PROJECT_ID},HAIRVAULT_API_URL=${HAIRVAULT_API_URL}"

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" --format="value(status.url)")

gcloud iam service-accounts create fraud-agent-pubsub-invoker \
  --display-name="Pub/Sub invoker for fraud agent" || true
PUSH_SA="fraud-agent-pubsub-invoker@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud run services add-iam-policy-binding "$SERVICE_NAME" \
  --region "$REGION" \
  --member="serviceAccount:${PUSH_SA}" --role="roles/run.invoker"

gcloud pubsub topics create "$TOPIC_NAME" || true

gcloud pubsub subscriptions create "$SUBSCRIPTION_NAME" \
  --topic="$TOPIC_NAME" \
  --push-endpoint="${SERVICE_URL}/fraud-agent/events" \
  --push-auth-service-account="$PUSH_SA" \
  --ack-deadline=60

echo "Deployed (private): $SERVICE_URL"
echo "Health check: curl -H \"Authorization: Bearer \$(gcloud auth print-identity-token)\" ${SERVICE_URL}/fraud-agent/healthz"
