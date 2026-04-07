# vef-proxy Networking — Architecture Decision & Rollback Notes

**Last updated:** 2026-04-06

---

## Current State (Working)

| Service | Ingress | Auth | VPC Connector |
|---------|---------|------|---------------|
| `ssrvexpuibb` | All (public) | Firebase Auth (user-facing) | None |
| `vef-proxy` | All | `no-allow-unauthenticated` + IAM | None |

**Call path:**
```
Browser → ssrvexpuibb (public) → vef-proxy (all ingress, IAM-gated) → Vertex AI
```

**IAM binding on vef-proxy:**
```
roles/run.invoker → serviceAccount:104454103637-compute@developer.gserviceaccount.com
```
Only `ssrvexpuibb`'s compute SA can invoke `vef-proxy`. All other callers get 403.

---

## What Was Attempted — VPC Connector + Internal Ingress

### Goal
Move `vef-proxy` to `ingress: internal` so it is not reachable from the public internet at all. Defence-in-depth on top of IAM.

### Steps that were run
```bash
# 1. Create VPC connector
gcloud compute networks vpc-access connectors create vef-connector \
  --region us-central1 \
  --range 10.8.0.0/28 \
  --project bagchi-genai-bb

# 2. Attach VPC connector to ssrvexpuibb
gcloud run services update ssrvexpuibb \
  --vpc-connector vef-connector \
  --vpc-egress all-traffic \
  --region us-central1 \
  --project bagchi-genai-bb

# 3. Set vef-proxy to internal ingress
gcloud run services update vef-proxy \
  --ingress internal \
  --region us-central1 \
  --project bagchi-genai-bb
```

### Why it failed

**Problem 1 — Firebase overwrites VPC connector on every deploy:**
Firebase Frameworks manages `ssrvexpuibb` and generates its own Cloud Run revision config on each `firebase deploy`. It has no knowledge of the VPC connector, so every deploy produces a new revision with `Network: None`, stripping the connector. Traffic shifts to the new revision and `vef-proxy` (internal ingress) becomes unreachable.

**Problem 2 — VPC connector + internal ingress may not route correctly:**
Even when the VPC connector was successfully attached (before Firebase overwrote it), `vef-proxy` received **zero requests**. `ssrvexpuibb` logs showed Google's generic 404 HTML in response. Likely cause: `vef-proxy-uhz33244pa-uc.a.run.app` always resolves to a public IP. Traffic from ssrvexpuibb through the VPC connector hits that public IP, and Cloud Run's internal ingress may not accept the traffic path even from a same-project VPC connector. This was never fully confirmed because Firebase always overwrote the connector before isolated testing could be done.

**Note:** Private Google Access is enabled on the default subnet (`us-central1`), so Google API calls (`googleapis.com`) would work through the VPC. But `*.run.app` is not a `googleapis.com` domain — it may not benefit from PGA routing.

### VPC connector that was created
```
Name:    vef-connector
Region:  us-central1
Range:   10.8.0.0/28
Project: bagchi-genai-bb
```
The connector still exists and can be used if this is retried.

---

## Rollback — Restore Current Working State

If `vef-proxy` is ever accidentally set to `internal` ingress and the proxy breaks:

```bash
# Restore vef-proxy to all ingress (immediate fix)
gcloud run services update vef-proxy \
  --ingress all \
  --region us-central1 \
  --project bagchi-genai-bb
```

If VPC connector was attached to `ssrvexpuibb` and needs to be removed:
```bash
gcloud run services update ssrvexpuibb \
  --clear-vpc-connector \
  --region us-central1 \
  --project bagchi-genai-bb
```

---

## Post-Deploy Script Approach (Untested — Proceed with Caution)

A deploy script could re-attach the VPC connector after every Firebase deploy:

```bash
#!/usr/bin/env bash
set -e

# Step 1 — Deploy app
firebase deploy --only hosting

# Step 2 — Re-attach VPC connector (Firebase strips it on every deploy)
gcloud run services update ssrvexpuibb \
  --vpc-connector vef-connector \
  --vpc-egress all-traffic \
  --region us-central1 \
  --project bagchi-genai-bb

echo "✔ Done — VPC connector re-attached"
```

**Risks:**
1. Operationally fragile — forgetting to use the script breaks prod immediately
2. Problem 2 above (routing) was never confirmed fixed — vef-proxy may still receive zero traffic even with connector attached

**Before committing to this approach:** test in isolation by running just the `gcloud run services update ssrvexpuibb --vpc-connector` command (without a preceding Firebase deploy) and verify vef-proxy logs show incoming traffic before switching it to `internal` ingress.

---

## Decision

**Accepted architecture: `ingress: all` + IAM**

The IAM gate (`no-allow-unauthenticated` + `run.invoker` restricted to compute SA) is the primary and sufficient security control. The public URL being resolvable does not grant access — all unauthenticated requests get 403 from Cloud Run before reaching any code.

To revisit internal ingress in the future, Firebase would need to support VPC connector configuration natively (not currently available as of 2026-04-06).
