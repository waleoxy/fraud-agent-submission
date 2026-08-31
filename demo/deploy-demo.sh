#!/usr/bin/env bash
set -euo pipefail

# Deploys the DEMO app — mock adapter, fake data, no HairVault access.
# Separate service from your real production agent on purpose: this one
# is meant to be public and free for anyone (including judges) to hit.

PROJECT_ID="fraud-resolution-agent"
REGION="us-central1"
SERVICE_NAME="fraud-agent-demo"

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com aiplatform.googleapis.com

gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_GENAI_USE_VERTEXAI=true,GCP_REGION=global,GOOGLE_CLOUD_PROJECT=${PROJECT_ID}"

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" --format="value(status.url)")

echo "Public demo live at: $SERVICE_URL"
