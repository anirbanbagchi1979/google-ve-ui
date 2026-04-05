import { NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import path from "path";

const auth = new GoogleAuth({
  keyFile: path.join(process.cwd(), "service-account.json"),
  scopes: "https://www.googleapis.com/auth/cloud-platform",
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const operationName = searchParams.get("name");

    if (!operationName) {
      return NextResponse.json({ error: "Missing operation name" }, { status: 400 });
    }

    // Get an authorized client
    const client = await auth.getClient();
    const projectId = await auth.getProjectId();
    
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    // Build the Vertex AI URL accurately
    // Note: ensure operationName doesn't have a leading slash
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
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { endpoint, payload } = await request.json();

    if (!endpoint || !payload) {
      return NextResponse.json({ error: "Missing endpoint or payload" }, { status: 400 });
    }

    // Get an authorized client (automatically handles token refresh)
    const client = await auth.getClient();
    const projectId = await auth.getProjectId();
    
    // Get the access token
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "X-Vertex-AI-LLM-Request-Type": "shared",
        "X-Goog-User-Project": projectId, // Required for ADC/SA tokens in some regions
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    console.error("Proxy error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
