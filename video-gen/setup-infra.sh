#!/usr/bin/env bash
# =============================================================================
# setup-infra.sh
# Bootstraps the full video-gen infrastructure in a new GCP + Firebase project.
#
# ARCHITECTURE:
#   Browser → ssrvexpuibb (Firebase-managed Cloud Run, public)
#           → vef-proxy (Cloud Run, ingress:all, no-allow-unauthenticated)
#           → Vertex AI (VERTEX_PROJECT)
#   Outputs → Firebase Storage (GCP_PROJECT)
#
# NOTE ON NETWORKING:
#   vef-proxy uses ingress:all (not internal). Internal ingress was tested
#   and confirmed non-functional for Cloud Run → Cloud Run via *.run.app URLs
#   even with Serverless VPC Access connector. See VPC_NETWORKING.md.
#   Security is enforced by IAM (run.invoker restricted to compute SA only).
#
# PREREQUISITES:
#   - gcloud CLI installed and authenticated (gcloud auth login)
#   - firebase CLI installed (npm i -g firebase-tools) and authenticated
#   - Node.js 20+ installed
#   - A GCP project already created with billing enabled
#   - A Firebase project linked to that GCP project
#   - Vertex AI API enabled in VERTEX_PROJECT
#   - If VERTEX_PROJECT != GCP_PROJECT: you need admin access to both
#
# USAGE:
#   1. Fill in the CONFIGURE section below
#   2. chmod +x setup-infra.sh && ./setup-infra.sh
# =============================================================================

set -euo pipefail

# =============================================================================
# CONFIGURE — fill these in before running
# =============================================================================

# GCP project that hosts Firebase Hosting + Cloud Run + Firestore + Storage
GCP_PROJECT="your-gcp-project-id"

# Firebase project ID (usually same as GCP_PROJECT)
FIREBASE_PROJECT="your-firebase-project-id"

# GCP project where Vertex AI quota lives (can be same as GCP_PROJECT)
# If different, you need admin access there to grant IAM permissions
VERTEX_PROJECT="your-vertex-ai-project-id"

# Region for all Cloud Run services
REGION="us-central1"

# Firebase Hosting site name (check firebase.json → hosting.site)
HOSTING_SITE="your-firebase-site-name"

# Firebase Storage bucket (format: <project-id>.firebasestorage.app)
# This is used for BOTH input uploads AND Vertex AI output videos
STORAGE_BUCKET="${GCP_PROJECT}.firebasestorage.app"

# Firestore database ID (use "(default)" or a named database)
FIRESTORE_DB_ID="(default)"

# Name for the proxy Cloud Run service
PROXY_SERVICE="vef-proxy"

# Firebase API keys — get these from Firebase Console → Project Settings → Your apps
FIREBASE_API_KEY="your-firebase-api-key"
FIREBASE_AUTH_DOMAIN="${GCP_PROJECT}.firebaseapp.com"
FIREBASE_MESSAGING_SENDER_ID="your-messaging-sender-id"
FIREBASE_APP_ID="your-firebase-app-id"

# =============================================================================
# HELPERS
# =============================================================================

info()    { echo -e "\n\033[1;34m▶ $*\033[0m"; }
success() { echo -e "\033[1;32m✔ $*\033[0m"; }
warn()    { echo -e "\033[1;33m⚠ $*\033[0m"; }
die()     { echo -e "\033[1;31m✖ ERROR: $*\033[0m"; exit 1; }

require() {
  command -v "$1" &>/dev/null || die "$1 is required but not installed."
}

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

# =============================================================================
# PREFLIGHT CHECKS
# =============================================================================

require gcloud
require firebase
require node

info "Checking gcloud authentication..."
gcloud auth print-access-token &>/dev/null || die "Not authenticated. Run: gcloud auth login"

info "Resolving project number for $GCP_PROJECT..."
GCP_PROJECT_NUMBER=$(gcloud projects describe "$GCP_PROJECT" --format="value(projectNumber)") \
  || die "Cannot describe $GCP_PROJECT — check project ID and permissions."
COMPUTE_SA="${GCP_PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
success "Project number: $GCP_PROJECT_NUMBER"
success "Compute SA: $COMPUTE_SA"

[[ -f "$REPO_ROOT/proxy-service/index.js" ]]   || die "proxy-service/index.js not found"
[[ -f "$REPO_ROOT/proxy-service/Dockerfile" ]] || die "proxy-service/Dockerfile not found"

# =============================================================================
# STEP 1 — Enable required GCP APIs
# =============================================================================

info "Step 1: Enabling required GCP APIs in $GCP_PROJECT..."

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  firebase.googleapis.com \
  identitytoolkit.googleapis.com \
  storage.googleapis.com \
  --project="$GCP_PROJECT"

if [[ "$VERTEX_PROJECT" != "$GCP_PROJECT" ]]; then
  info "Enabling Vertex AI API in $VERTEX_PROJECT..."
  gcloud services enable aiplatform.googleapis.com --project="$VERTEX_PROJECT"
else
  gcloud services enable aiplatform.googleapis.com --project="$GCP_PROJECT"
fi

success "APIs enabled."

# =============================================================================
# STEP 2 — Grant compute SA Vertex AI access
# =============================================================================

info "Step 2: Granting compute SA Vertex AI user role in $VERTEX_PROJECT..."

gcloud projects add-iam-policy-binding "$VERTEX_PROJECT" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/aiplatform.user" \
  --condition=None

success "Vertex AI access granted to $COMPUTE_SA"

# =============================================================================
# STEP 3 — Grant Vertex AI service agent write access to Firebase Storage
#
# Vertex AI writes output videos directly to Firebase Storage.
# The Vertex AI service agent in VERTEX_PROJECT needs objectCreator on the bucket.
# =============================================================================

info "Step 3: Granting Vertex AI service agent storage write access..."

if [[ "$VERTEX_PROJECT" == "$GCP_PROJECT" ]]; then
  VERTEX_PROJECT_NUMBER="$GCP_PROJECT_NUMBER"
else
  VERTEX_PROJECT_NUMBER=$(gcloud projects describe "$VERTEX_PROJECT" \
    --format="value(projectNumber)" 2>/dev/null) \
    || { warn "Cannot get $VERTEX_PROJECT number — skipping Vertex AI storage grant."; VERTEX_PROJECT_NUMBER=""; }
fi

if [[ -n "$VERTEX_PROJECT_NUMBER" ]]; then
  VERTEX_SA="service-${VERTEX_PROJECT_NUMBER}@gcp-sa-aiplatform.iam.gserviceaccount.com"
  gcloud storage buckets add-iam-policy-binding "gs://${STORAGE_BUCKET}" \
    --member="serviceAccount:${VERTEX_SA}" \
    --role="roles/storage.objectCreator" \
    --project="$GCP_PROJECT" \
    && success "Storage write granted to Vertex AI service agent: $VERTEX_SA" \
    || warn "Could not grant storage access to $VERTEX_SA — do this manually in the Console."
else
  warn "Skipped Vertex AI storage grant — add manually:"
  warn "  service-<VERTEX_PROJECT_NUMBER>@gcp-sa-aiplatform.iam.gserviceaccount.com"
  warn "  → roles/storage.objectCreator on gs://$STORAGE_BUCKET"
fi

# =============================================================================
# STEP 4 — Apply Firebase Storage CORS config
# =============================================================================

info "Step 4: Applying CORS config to gs://$STORAGE_BUCKET..."

CORS_FILE="$REPO_ROOT/cors.json"

if [[ -f "$CORS_FILE" ]]; then
  gcloud storage buckets update "gs://${STORAGE_BUCKET}" \
    --cors-file="$CORS_FILE" \
    --project="$GCP_PROJECT" \
    && success "CORS config applied." \
    || warn "CORS apply failed — apply manually in Cloud Console → Storage → bucket → Configuration."
else
  warn "cors.json not found — skipping CORS setup."
fi

# =============================================================================
# STEP 5 — Deploy vef-proxy to Cloud Run
#
# SECURITY MODEL:
#   - ingress: all (internal ingress confirmed non-functional, see VPC_NETWORKING.md)
#   - no-allow-unauthenticated: Cloud Run rejects all requests without valid identity token
#   - IAM: only compute SA granted run.invoker (set in Step 6)
# =============================================================================

info "Step 5: Deploying vef-proxy Cloud Run service..."

gcloud run deploy "$PROXY_SERVICE" \
  --source "$REPO_ROOT/proxy-service" \
  --region "$REGION" \
  --project "$GCP_PROJECT" \
  --no-allow-unauthenticated \
  --ingress all \
  --timeout 300 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10

PROXY_URL=$(gcloud run services describe "$PROXY_SERVICE" \
  --region "$REGION" \
  --project "$GCP_PROJECT" \
  --format "value(status.url)")

success "vef-proxy deployed at: $PROXY_URL"

# =============================================================================
# STEP 6 — Grant compute SA run.invoker on vef-proxy
# =============================================================================

info "Step 6: Locking vef-proxy to compute SA only..."

gcloud run services add-iam-policy-binding "$PROXY_SERVICE" \
  --region "$REGION" \
  --project "$GCP_PROJECT" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/run.invoker"

success "IAM binding set — only $COMPUTE_SA can invoke vef-proxy."

# =============================================================================
# STEP 7 — Patch PROXY_URL in route.ts
# =============================================================================

info "Step 7: Updating PROXY_URL in src/app/api/proxy/route.ts..."

ROUTE_FILE="$REPO_ROOT/src/app/api/proxy/route.ts"

if [[ -f "$ROUTE_FILE" ]]; then
  sed -i.bak "s|const PROXY_URL = \".*\"|const PROXY_URL = \"${PROXY_URL}\"|" "$ROUTE_FILE"
  rm -f "${ROUTE_FILE}.bak"
  success "PROXY_URL updated to $PROXY_URL"
else
  warn "route.ts not found — update PROXY_URL manually to: $PROXY_URL"
fi

# =============================================================================
# STEP 8 — Generate .env.local
# =============================================================================

info "Step 8: Generating .env.local..."

ENV_FILE="$REPO_ROOT/.env.local"

cat > "$ENV_FILE" <<EOF
NEXT_PUBLIC_FIREBASE_API_KEY=${FIREBASE_API_KEY}
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${FIREBASE_AUTH_DOMAIN}
NEXT_PUBLIC_FIREBASE_PROJECT_ID=${GCP_PROJECT}
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${STORAGE_BUCKET}
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${FIREBASE_MESSAGING_SENDER_ID}
NEXT_PUBLIC_FIREBASE_APP_ID=${FIREBASE_APP_ID}
NEXT_PUBLIC_FIREBASE_FIRESTORE_DB_ID=${FIRESTORE_DB_ID}

NEXT_PUBLIC_GCP_PROJECT_ID=${VERTEX_PROJECT}
NEXT_PUBLIC_GCS_BUCKET=${STORAGE_BUCKET}
EOF

success ".env.local written."

# =============================================================================
# STEP 9 — Update .firebaserc
# =============================================================================

info "Step 9: Updating .firebaserc..."

cat > "$REPO_ROOT/.firebaserc" <<EOF
{
  "projects": {
    "default": "${FIREBASE_PROJECT}"
  }
}
EOF

success ".firebaserc updated."

# =============================================================================
# STEP 10 — Firebase deploy
# =============================================================================

info "Step 10: Deploying Next.js app to Firebase Hosting..."

cd "$REPO_ROOT"
firebase deploy --only hosting --project "$FIREBASE_PROJECT"

success "Firebase deploy complete."

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo "============================================================"
echo " SETUP COMPLETE"
echo "============================================================"
echo " GCP Project:        $GCP_PROJECT"
echo " Firebase Project:   $FIREBASE_PROJECT"
echo " Vertex AI Project:  $VERTEX_PROJECT"
echo " vef-proxy URL:      $PROXY_URL"
echo " Storage bucket:     gs://$STORAGE_BUCKET"
echo " Hosting URL:        https://${HOSTING_SITE}.web.app"
echo ""
echo " MANUAL STEPS STILL REQUIRED:"
echo "   1. Firebase Console → Authentication → Sign-in method"
echo "      → Enable Google provider"
echo "   2. Firebase Console → Firestore → Create database"
echo "      (use database ID: $FIRESTORE_DB_ID)"
echo "   3. Firebase Console → Storage → Get started"
echo "      (creates gs://$STORAGE_BUCKET)"
echo "   4. Set Firestore security rules (see firestore.rules if committed)"
echo "   5. For local dev: download a service account key from"
echo "      $VERTEX_PROJECT with Vertex AI access"
echo "      → save as service-account.json (already in .gitignore)"
echo ""
echo " VERIFY:"
echo "   - Open https://${HOSTING_SITE}.web.app"
echo "   - Sign in with Google"
echo "   - Trigger a generation"
echo "   - Check vef-proxy logs:"
echo "     gcloud logging read 'resource.labels.service_name=\"$PROXY_SERVICE\"'"
echo "       --project=$GCP_PROJECT --limit=10"
echo "============================================================"
