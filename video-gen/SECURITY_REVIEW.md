# Security Review — video-gen
**Original audit date:** 2026-04-05
**Last updated:** 2026-04-06

---

## Status Summary

| # | Finding | Severity | Status | Resolved |
|---|---------|----------|--------|----------|
| 1 | No auth on `/api/proxy` | CRITICAL | ✅ Fixed | 2026-04-06 |
| 2 | SSRF in proxy POST handler | CRITICAL | ✅ Fixed | 2026-04-06 |
| 3 | Client-side email allowlist bypass | HIGH | ✅ Fixed | 2026-04-06 |
| 4 | GCP access token in localStorage | HIGH | ✅ Fixed | 2026-04-06 |
| 5 | Stack traces returned to client | MEDIUM | ❌ Open | — |
| 6 | No rate limiting | MEDIUM | ❌ Open | — |
| 7 | No Firestore security rules in repo | MEDIUM | ❌ Open | — |
| 8 | `service-account.json` in repo | LOW | ✅ Fixed | 2026-04-06 |
| 9 | No security headers | LOW | ❌ Open | — |
| 10 | Firebase config exposed client-side | INFO | ❌ Open | — |

---

## CRITICAL

### 1. ✅ No authentication on `/api/proxy`
~~The proxy endpoint has zero authentication. Any unauthenticated caller can invoke arbitrary Vertex AI / GCP APIs using the app's service account credentials.~~

**Resolution (2026-04-06):** Replaced with a private `vef-proxy` Cloud Run service (`no-allow-unauthenticated`, `ingress: all`). Only `ssrvexpuibb`'s compute SA (`104454103637-compute@developer.gserviceaccount.com`) holds `roles/run.invoker`. The browser cannot reach `vef-proxy` at all — stronger than the originally proposed Firebase token check.

---

### 1b. ⚠️ vef-proxy ingress set to All (accepted risk)
`vef-proxy` uses `ingress: all` rather than `internal`. Internal ingress was attempted but Cloud Run service-to-service calls do not route through the VPC when the calling service (ssrvexpuibb) is Firebase-managed — Firebase overwrites VPC connector settings on every deploy, breaking the proxy. Switching to internal immediately causes proxy failures.

**Accepted mitigation:** `no-allow-unauthenticated` + IAM (`roles/run.invoker` granted only to the compute SA) means every unauthenticated or unauthorised request is rejected by Cloud Run before reaching any code. The URL being publicly resolvable does not grant access.

---

### 2. ✅ SSRF in proxy POST handler
~~The `endpoint` parameter from the request body is passed directly to `fetch()` without validation. An attacker can make the server fetch any URL (internal GCP metadata, other services).~~

**Resolution (2026-04-06):** Added `ALLOWED_ENDPOINT_PREFIXES` allowlist in `proxy-service/index.js`. Any `endpoint` value that does not start with an approved `aiplatform.googleapis.com` regional prefix is rejected with 400 before any network call is made.

```js
const ALLOWED_ENDPOINT_PREFIXES = [
  "https://us-central1-aiplatform.googleapis.com/",
  "https://us-east1-aiplatform.googleapis.com/",
  "https://europe-west1-aiplatform.googleapis.com/",
  "https://asia-east1-aiplatform.googleapis.com/",
];
```

---

## HIGH

### 3. ✅ Client-side-only email allowlist
~~`ALLOWED_EMAILS` in `page.tsx` is a UI gate only. The `/api/proxy` route has no user identity check, so anyone who discovers the endpoint bypasses the allowlist entirely.~~

**Resolution (2026-04-06):** Fixed as a consequence of #1. The browser never reaches `vef-proxy` regardless of auth state. IAM is the enforcement boundary, not client-side email checks.

---

### 4. ✅ GCP access token in localStorage
~~Token stored in localStorage is readable by any JS on the page (XSS risk).~~

**Resolution (2026-04-06):** The `gcp_access_token` localStorage key and associated `accessToken`/`setToken` API in `AuthContext` were found to be dead code — nothing consumed the value after the proxy architecture was introduced. Removed entirely from `AuthContext.tsx`, `LoginPage.tsx`, `Navbar.tsx`, and `page.tsx`. The Google OAuth access token is no longer stored anywhere client-side.

---

## MEDIUM

### 5. ❌ Stack traces returned to client
Error responses from the proxy include full Node.js stack traces, leaking internal file paths and library versions.

**Fix:** Return only a generic error message to the client; log full trace server-side.

---

### 6. ❌ No rate limiting
`/api/proxy` has no rate limiting. A single user can exhaust Vertex AI quotas.

**Fix:** Verify Firebase ID token in `route.ts`, extract UID, increment a per-user counter in Firestore per time window. Reject with 429 when exceeded.

---

### 7. ❌ No Firestore security rules in repo
No `firestore.rules` file committed. Rules may be open in production or may have drifted from intent.

**Fix:** Add `firestore.rules` to the repo and deploy with `firebase deploy --only firestore:rules`.

---

## LOW / INFORMATIONAL

### 8. ✅ `service-account.json` committed to repo
~~Repo was private; key was committed as an interim fix.~~

**Resolution (2026-04-06):** Removed from git tracking, added to `.gitignore`. Production uses ADC (default compute SA). Key lives only on local dev machine.

---

### 9. ❌ No security headers
No CSP, X-Frame-Options, or other security headers set in Next.js config or Cloud Run.

**Fix:** Add headers in `next.config.js`:

```js
headers: async () => [{
  source: "/(.*)",
  headers: [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Content-Security-Policy", value: "default-src 'self' ..." },
  ]
}]
```

---

### 10. ❌ Firebase config exposed client-side
Standard for Firebase web apps; acceptable since Firestore rules enforce access. Depends on Firestore rules being correct (see #7).

---

## Remaining Work (Priority Order)

| Priority | Issue | Effort |
|----------|-------|--------|
| 1 | Add Firestore security rules (#7) | Medium |
| 2 | Add rate limiting (#6) | Medium |
| 3 | Remove stack traces from error responses (#5) | Low |
| 4 | Add security headers (#9) | Low |
