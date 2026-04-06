import { NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import path from "path";

// Initialize the Google Auth client with the service account key
const auth = new GoogleAuth({
  keyFile: path.join(process.cwd(), "service-account.json"),
  scopes: "https://www.googleapis.com/auth/cloud-platform",
});

const ADMIN_EMAILS = ["anirban.bagchi@gmail.com", "bagchi@google.com"];

/**
 * Verify the Firebase ID token and check the caller's email is
 * either an admin or in the Firestore allowlist.
 *
 * Controlled by ENFORCE_PROXY_AUTH env var:
 *   false (default) → skip all checks (safe for local dev / staged rollout)
 *   true            → enforce (set in Cloud Run env for production)
 */
async function verifyAndAuthorize(
  request: Request
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (process.env.ENFORCE_PROXY_AUTH !== "true") {
    return { ok: true };
  }

  // 1. Extract token
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing or malformed Authorization header" };
  }
  const idToken = authHeader.slice(7);

  // 2. Verify with Firebase (no firebase-admin needed — uses public REST API)
  const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const verifyRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!verifyRes.ok) {
    return { ok: false, status: 401, error: "Invalid or expired token" };
  }

  const verifyData = await verifyRes.json();
  const email: string | undefined = verifyData.users?.[0]?.email;

  if (!email) {
    return { ok: false, status: 401, error: "Could not extract email from token" };
  }

  // 3. Check admin list first (no extra network call)
  if (ADMIN_EMAILS.includes(email)) {
    return { ok: true };
  }

  // 4. Check Firestore allowlist using the service account token we already have
  try {
    const client = await auth.getClient();
    const saToken = (await client.getAccessToken()).token;
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const dbId = process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_DB_ID || "(default)";

    const fsRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/allowlist?pageSize=200`,
      { headers: { Authorization: `Bearer ${saToken}` } }
    );

    if (fsRes.ok) {
      const fsData = await fsRes.json();
      const allowedEmails: string[] = (fsData.documents ?? [])
        .map((d: any) => d.fields?.email?.stringValue)
        .filter(Boolean);

      if (allowedEmails.includes(email)) {
        return { ok: true };
      }
    }
  } catch (e) {
    console.error("[Proxy] Allowlist check failed:", e);
  }

  return { ok: false, status: 403, error: `${email} is not on the allowlist` };
}

export async function GET(request: Request) {
  const auth_check = await verifyAndAuthorize(request);
  if (!auth_check.ok) {
    return NextResponse.json({ error: auth_check.error }, { status: auth_check.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const operationName = searchParams.get("name");

    if (!operationName) {
      return NextResponse.json({ error: "Missing operation name" }, { status: 400 });
    }

    const client = await auth.getClient();
    const projectId = await auth.getProjectId();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    const sanitizedName = operationName.startsWith("/") ? operationName.substring(1) : operationName;
    const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/${sanitizedName}`;

    console.log(`[Proxy GET] Polling Operation: ${endpoint}`);

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-Goog-User-Project": projectId,
      },
    });

    const data = await response.json();

    if (response.status >= 400) {
      console.warn(`[Proxy GET] API Error (${response.status}):`, data);
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    console.error("[Proxy GET] Crash:", error.message);
    // Don't leak stack traces
    return NextResponse.json({ error: "Internal proxy error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth_check = await verifyAndAuthorize(request);
  if (!auth_check.ok) {
    return NextResponse.json({ error: auth_check.error }, { status: auth_check.status });
  }

  try {
    const { endpoint, payload } = await request.json();

    if (!endpoint || !payload) {
      return NextResponse.json({ error: "Missing endpoint or payload" }, { status: 400 });
    }

    const client = await auth.getClient();
    const projectId = await auth.getProjectId();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "X-Vertex-AI-LLM-Request-Type": "shared",
        "X-Goog-User-Project": projectId,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    console.error("[Proxy POST] Crash:", error.message);
    // Don't leak stack traces
    return NextResponse.json({ error: "Internal proxy error" }, { status: 500 });
  }
}
