#!/bin/bash

# Configuration
PROJECT_ID="refillx-smart"

echo "Submitting build to Google Cloud Container Registry..."
gcloud builds submit --tag gcr.io/${PROJECT_ID}/refillx-ai --project ${PROJECT_ID}

echo "Deploying refillx-ai microservice to Cloud Run..."
gcloud run deploy refillx-ai \
  --image gcr.io/${PROJECT_ID}/refillx-ai \
  --platform managed \
  --region asia-south1 \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 0 \
  --max-instances 3 \
  --set-env-vars FIRESTORE_PROJECT_ID=${PROJECT_ID} \
  --service-account refillx-ai@${PROJECT_ID}.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --project ${PROJECT_ID}

echo "Deployment complete."
