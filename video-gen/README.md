# Vertex Experimental Flow

A Next.js application for generating, transforming, and upscaling AI videos using Google's Veo models on Vertex AI.

**Live:** https://vexp-ui-bb.web.app

---

## Features

- **Video Generation** — Text-to-video and image-to-video via Veo on Vertex AI
- **4K Upscaling** — Upscale any video to 4K using `veo3p1_upscale`
- **Video Transform** — Transform videos with control image, mask video, strength and diffusion step controls via `veo-experimental`
- **Task Monitor** — Real-time LRO tracking with filters by type, status, date, and user
- **Side-by-side Preview** — Compare input vs output for upscale and transform jobs
- **Project Isolation** — Operations and assets scoped per project
- **Multi-user** — Firestore allowlist + admin list controls access

---

## Video Input Constraints

**Maximum: 192 frames at 24 fps = 8 seconds**

The Veo upscale and transform APIs require input videos that meet these constraints:

| Constraint | Limit | How enforced |
|---|---|---|
| Duration | ≤ 8 seconds | Client-side — blocked before upload begins |
| Frame count | ≤ 192 frames | Derived from 8s × 24fps |
| Frame rate | 24 fps | Server-side by Vertex AI (cannot be measured client-side without playback) |

If you upload a video longer than 8 seconds the app will block it immediately with an error before any bytes are sent. Videos with the wrong frame rate pass the client check but will be rejected by the API.

**To prepare a compliant video:**
```bash
# Trim to 8s and set 24fps using ffmpeg
ffmpeg -i input.mp4 -t 8 -vf fps=24 -c:v libx264 -crf 18 output.mp4
```

---

## Prerequisites

- Node.js 18+
- A Google Cloud project with the following APIs enabled:
  - Vertex AI API (`aiplatform.googleapis.com`)
  - Cloud Run API (`run.googleapis.com`)
  - Cloud Functions API (`cloudfunctions.googleapis.com`)
  - Firebase Extensions API (`firebaseextensions.googleapis.com`)
  - Eventarc API (`eventarc.googleapis.com`)
  - Pub/Sub API (`pubsub.googleapis.com`)
  - Cloud Storage API (`storage.googleapis.com`)
- A Firebase project with Firestore, Storage, and Authentication enabled
- A service account with Vertex AI permissions

---

## Local Development

### 1. Install dependencies

```bash
cd video-gen
npm install
```

### 2. Configure environment

Copy the example and fill in your values:

```bash
cp .env.local.example .env.local
```

Required variables:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIRESTORE_DB_ID=
```

### 3. Add service account

Place your GCP service account key at:

```
video-gen/service-account.json
```

This file is gitignored and used by the Next.js API proxy (`/api/proxy`) to authenticate calls to Vertex AI.

The service account needs the following IAM roles on the GCP project:
- **Vertex AI User** (`roles/aiplatform.user`) — to call Veo APIs
- **Storage Object Admin** (`roles/storage.objectAdmin`) — to write output videos to GCS

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment (Firebase Hosting)

The app is deployed to Firebase Hosting with SSR via Cloud Run.

### Hosting site

| Property | Value |
|---|---|
| GCP Project | `bagchi-genai-bb` |
| Firebase Hosting Site | `vexp-ui-bb` |
| Live URL | `https://vexp-ui-bb.web.app` |
| Cloud Run service | `firebase-frameworks-bagchi-genai-bb` / `ssrvexpuibb` (us-central1) |

### Required IAM permissions for deployment

The account running `firebase deploy` needs the following roles on the GCP project (`bagchi-genai-bb`):

| Role | Purpose |
|---|---|
| `roles/cloudfunctions.admin` | Create/update SSR Cloud Functions/Run service and set IAM policy |
| `roles/run.admin` | Manage the Cloud Run service backing SSR |
| `roles/iam.serviceAccountUser` | Act as the service account used by Cloud Run |
| `roles/firebase.admin` | Deploy Firebase Hosting, Firestore rules, Storage rules |

Grant via console: [IAM Console](https://console.cloud.google.com/iam-admin/iam?project=bagchi-genai-bb)

Or via CLI:

```bash
gcloud projects add-iam-policy-binding bagchi-genai-bb \
  --member="user:your-email@google.com" \
  --role="roles/cloudfunctions.admin"
```

### Renaming the hosting site

Changing the `"site"` field in `firebase.json` causes Firebase to create a **new** Cloud Run service with a new name. This requires `cloudfunctions.functions.setIamPolicy` (included in `roles/cloudfunctions.admin`). The old Cloud Run service must be manually deleted from the [Cloud Run console](https://console.cloud.google.com/run?project=bagchi-genai-bb) after migration.

### Deploy

```bash
firebase deploy
```

To deploy only hosting (skipping Firestore/Storage rules):

```bash
firebase deploy --only hosting
```

---

## Security

All Vertex AI calls go through `vef-proxy` — a private Cloud Run service that the browser cannot reach directly:

- `no-allow-unauthenticated` — Cloud Run rejects all unauthenticated requests before code runs
- `roles/run.invoker` granted only to the compute SA of `ssrvexpuibb` (the Firebase-managed Cloud Run service)
- SSRF allowlist — `vef-proxy` only forwards requests to `aiplatform.googleapis.com` prefixes
- No GCP credentials are stored client-side

See [SECURITY_REVIEW.md](SECURITY_REVIEW.md) for the full audit (10 findings; 5 resolved).

### Remaining open items

| # | Issue | Priority |
|---|---|---|
| 5 | Stack traces returned to client in error responses | MEDIUM |
| 6 | No rate limiting on `vef-proxy` | MEDIUM |
| 7 | No Firestore security rules committed to repo | MEDIUM |
| 9 | No CSP / security headers in `next.config.js` | LOW |
| 10 | Firebase config exposed client-side (acceptable; depends on #7) | INFO |

---

## Authentication

Access is restricted to:

- Any `@google.com` Google account
- `anirban.bagchi@gmail.com`

Configured in `src/app/page.tsx`. All users must sign in with Google OAuth.

---

## Firestore Security Rules

Enforce in the [Firebase Console](https://console.firebase.google.com/project/bagchi-genai-bb/firestore/rules):

```js
rules_version = '2';
service cloud.firestore {
  match /databases/video-gen-bb/documents {

    // Operations are private to the creating user
    match /operations/{operationId} {
      allow read, update, delete: if request.auth != null
        && request.auth.token.email == resource.data.userEmail;
      allow create: if request.auth != null
        && request.auth.token.email == request.resource.data.userEmail;
    }

    // Videos, mask videos, projects: any authorised user
    match /videos/{docId} {
      allow read, write: if request.auth != null
        && (request.auth.token.email.matches('.*@google\\.com')
            || request.auth.token.email == 'anirban.bagchi@gmail.com');
    }

    match /maskVideos/{docId} {
      allow read, write: if request.auth != null
        && (request.auth.token.email.matches('.*@google\\.com')
            || request.auth.token.email == 'anirban.bagchi@gmail.com');
    }

    match /projects/{docId} {
      allow read, write: if request.auth != null
        && (request.auth.token.email.matches('.*@google\\.com')
            || request.auth.token.email == 'anirban.bagchi@gmail.com');
    }
  }
}
```

> **Note:** Avoid a catch-all `match /{document=**}` rule — it overrides collection-specific rules and grants blanket access.

---

## GCS Bucket Structure

```
gs://<gcsBucket>/
  inputs/        # Source videos and images
  outputs/       # Generated / upscaled / transformed videos
  masks/         # Mask videos for Video Transform
  images/        # Control images for Video Transform
  videos/        # Uploaded input videos
```

---

## Architecture

```
Browser
  └── ssrvexpuibb (Firebase-managed Cloud Run — public)
        ├── Firebase Auth (Google OAuth)
        ├── Firestore (operations, videos, maskVideos, projects, allowlist)
        ├── Firebase Storage (video/image assets + Vertex AI outputs)
        └── /api/proxy ──► vef-proxy (Cloud Run, IAM-gated)
                                └──► Vertex AI (ADC via compute SA)
```

`vef-proxy` is a separate Cloud Run service (`no-allow-unauthenticated`, `ingress: all`). Only the compute SA of `ssrvexpuibb` holds `roles/run.invoker` on it. The browser talks to `ssrvexpuibb` which then calls `vef-proxy` with an identity token — credentials never leave the server.

See [VPC_NETWORKING.md](VPC_NETWORKING.md) for why `ingress: internal` was attempted and confirmed non-functional for this setup.
