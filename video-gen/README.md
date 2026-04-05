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
- **Multi-user** — All `@google.com` accounts + `anirban.bagchi@gmail.com`

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
  └── Next.js (Firebase Hosting SSR via Cloud Run)
        ├── /api/proxy  ──► Vertex AI (authenticated via service-account.json)
        ├── Firebase Auth (Google OAuth)
        ├── Firestore (operations, videos, maskVideos, projects)
        └── Firebase Storage (video/image assets)
```

The `/api/proxy` route signs all Vertex AI requests server-side using the service account, so the GCP credentials are never exposed to the browser.
