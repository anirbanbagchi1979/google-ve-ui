# Migration Plan: Private Proxy Cloud Run + Internal Networking

**Goal:** Move `/api/proxy` to a private Cloud Run service (`vef-proxy`) accessible only via internal VPC from the Next.js app. Browser can never reach the proxy directly.

**Project:** `bagchi-genai-bb`
**Region:** `us-central1`
**Next.js Cloud Run:** `ssrvexpuibb`
**Proxy Cloud Run (new):** `vef-proxy`
**Next.js SA:** `104454103637-compute@developer.gserviceaccount.com`

---

## Pre-flight checks (run before starting)

```bash
# Confirm current production is working
curl https://vexp-ui-bb.web.app

# Confirm gcloud is pointing at the right project
gcloud config set project bagchi-genai-bb
gcloud config get-value project

# Confirm current Cloud Run service is healthy
gcloud run services describe ssrvexpuibb \
  --region us-central1 \
  --project bagchi-genai-bb \
  --format="value(status.conditions[0].type)"
```

---

## Step 1 — Create standalone proxy Cloud Run service

### What it does
Deploys a new standalone Express proxy service. Nothing in production changes — nothing uses it yet.

### Forward
```bash
# From repo root
gcloud run deploy vef-proxy \
  --source ./proxy-service \
  --region us-central1 \
  --project bagchi-genai-bb \
  --no-allow-unauthenticated \
  --service-account 104454103637-compute@developer.gserviceaccount.com
```

### Verify
```bash
# Should return the service URL
gcloud run services describe vef-proxy \
  --region us-central1 \
  --project bagchi-genai-bb \
  --format="value(status.url)"

# Direct call should return 403 (unauthenticated blocked)
curl -X POST https://[VEF_PROXY_URL]/proxy \
  -H "Content-Type: application/json" \
  -d '{"endpoint":"test","payload":{}}'
# Expected: 403 Forbidden
```

### Rollback
```bash
gcloud run services delete vef-proxy \
  --region us-central1 \
  --project bagchi-genai-bb
```

---

## Step 2 — Lock proxy ingress to internal only

### What it does
Blocks all external traffic to `vef-proxy`. Zero user impact — nothing external calls it.

### Forward
```bash
gcloud run services update vef-proxy \
  --ingress internal \
  --region us-central1 \
  --project bagchi-genai-bb
```

### Verify
```bash
# Direct external call should now return 403 from GCP (not the app)
curl -X POST https://[VEF_PROXY_URL]/proxy \
  -H "Content-Type: application/json" \
  -d '{"endpoint":"test","payload":{}}'
# Expected: 403 from GCP ingress (not your app)

gcloud run services describe vef-proxy \
  --region us-central1 \
  --project bagchi-genai-bb \
  --format="value(spec.template.metadata.annotations['run.googleapis.com/ingress'])"
# Expected: internal
```

### Rollback
```bash
gcloud run services update vef-proxy \
  --ingress all \
  --region us-central1 \
  --project bagchi-genai-bb
```

---

## Step 3 — Create Serverless VPC Connector

### What it does
Creates a VPC connector that allows Cloud Run services to send traffic via Google's internal network. Does not affect any running service yet.

### Forward
```bash
gcloud compute networks vpc-access connectors create vef-connector \
  --region us-central1 \
  --project bagchi-genai-bb \
  --network default \
  --range 10.8.0.0/28 \
  --min-instances 2 \
  --max-instances 3
```

### Verify
```bash
gcloud compute networks vpc-access connectors describe vef-connector \
  --region us-central1 \
  --project bagchi-genai-bb \
  --format="value(state)"
# Expected: READY
```

### Rollback
```bash
gcloud compute networks vpc-access connectors delete vef-connector \
  --region us-central1 \
  --project bagchi-genai-bb
```

---

## Step 4 — Grant Next.js SA Cloud Run Invoker on proxy

### What it does
Allows the Next.js Cloud Run service account to call `vef-proxy` with an identity token. No behaviour change until Step 6.

### Forward
```bash
gcloud run services add-iam-policy-binding vef-proxy \
  --region us-central1 \
  --project bagchi-genai-bb \
  --member="serviceAccount:104454103637-compute@developer.gserviceaccount.com" \
  --role="roles/run.invoker"
```

### Verify
```bash
gcloud run services get-iam-policy vef-proxy \
  --region us-central1 \
  --project bagchi-genai-bb
# Expected: see roles/run.invoker for 104454103637-compute@developer.gserviceaccount.com
```

### Rollback
```bash
gcloud run services remove-iam-policy-binding vef-proxy \
  --region us-central1 \
  --project bagchi-genai-bb \
  --member="serviceAccount:104454103637-compute@developer.gserviceaccount.com" \
  --role="roles/run.invoker"
```

---

## Step 5 — Update route.ts to call proxy via identity token

### What it does
Next.js `/api/proxy` becomes a thin wrapper that calls `vef-proxy` using a GCP identity token. **Test locally first before deploying.**

### Forward (code change + deploy)
```bash
# 1. Set PROXY_URL in .env.local for local testing
echo "PROXY_URL=http://localhost:3001" >> .env.local

# 2. After local testing passes, set production env var
gcloud run services update ssrvexpuibb \
  --region us-central1 \
  --project bagchi-genai-bb \
  --set-env-vars PROXY_URL=https://[VEF_PROXY_URL]

# 3. Deploy code change
firebase deploy
```

### Verify
```bash
# Test a real generation in production
# Check Cloud Run logs for successful proxy calls
gcloud run services logs read ssrvexpuibb \
  --region us-central1 \
  --project bagchi-genai-bb \
  --limit 20
```

### Rollback
```bash
# Remove PROXY_URL — route.ts falls back to direct Vertex AI calls
gcloud run services update ssrvexpuibb \
  --region us-central1 \
  --project bagchi-genai-bb \
  --remove-env-vars PROXY_URL

# If code is deployed, revert and redeploy
git revert HEAD
firebase deploy
```

---

## Step 6 — Attach VPC connector to Next.js Cloud Run

### What it does
⚠️ **Highest risk step.** Enables internal networking so ssrvexpuibb can reach vef-proxy. Do this last and test immediately.

### Forward
```bash
gcloud run services update ssrvexpuibb \
  --vpc-connector vef-connector \
  --vpc-egress all-traffic \
  --region us-central1 \
  --project bagchi-genai-bb
```

### Verify immediately (within 2 minutes)
```bash
# 1. Hit production and run a real operation
open https://vexp-ui-bb.web.app

# 2. Check logs for errors
gcloud run services logs read ssrvexpuibb \
  --region us-central1 \
  --project bagchi-genai-bb \
  --limit 20

# 3. Confirm VPC connector is attached
gcloud run services describe ssrvexpuibb \
  --region us-central1 \
  --project bagchi-genai-bb \
  --format="value(spec.template.metadata.annotations['run.googleapis.com/vpc-access-connector'])"
# Expected: projects/bagchi-genai-bb/locations/us-central1/connectors/vef-connector
```

### Rollback (run immediately if anything breaks)
```bash
gcloud run services update ssrvexpuibb \
  --clear-vpc-connector \
  --region us-central1 \
  --project bagchi-genai-bb
```

---

## Full rollback (nuclear — restores everything to today's state)

```bash
# 1. Remove VPC connector from Next.js
gcloud run services update ssrvexpuibb \
  --clear-vpc-connector \
  --remove-env-vars PROXY_URL \
  --region us-central1 \
  --project bagchi-genai-bb

# 2. Revert and redeploy Next.js code
git revert HEAD
firebase deploy

# 3. Delete proxy service
gcloud run services delete vef-proxy \
  --region us-central1 \
  --project bagchi-genai-bb

# 4. Delete VPC connector
gcloud compute networks vpc-access connectors delete vef-connector \
  --region us-central1 \
  --project bagchi-genai-bb
```

---

## Step order summary

| # | Step | Risk | Impact if fails |
|---|---|---|---|
| 1 | Deploy vef-proxy | None | New service unused |
| 2 | Lock proxy ingress | None | Proxy unreachable externally (intended) |
| 3 | Create VPC connector | None | Connector unused |
| 4 | Grant IAM invoker | None | Just a permission |
| 5 | Update route.ts | Medium | Generations fail → revert PROXY_URL |
| 6 | Attach VPC connector | High | App may lose Vertex AI access → clear-vpc-connector |
