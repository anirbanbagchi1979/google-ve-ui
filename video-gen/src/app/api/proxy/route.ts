import { NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import path from "path";
import fs from "fs";
import { API } from "@/constants";

const PROXY_URL = API.PROXY_URL;

// In Cloud Run, K_SERVICE is set — use identity token to call vef-proxy
// Locally, call Vertex AI directly using the local service account key file
const IS_CLOUD_RUN = !!process.env.K_SERVICE;

const keyFile = [
  path.join(process.cwd(), "service-account.json"),
  "/workspace/service-account.json",
].find(p => fs.existsSync(p));

const directAuth = new GoogleAuth({
  ...(keyFile ? { keyFile } : {}),
  scopes: API.VERTEX_SCOPE,
});

const idTokenAuth = new GoogleAuth();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const operationName = searchParams.get("name");
    if (!operationName) {
      return NextResponse.json({ error: "Missing operation name" }, { status: 400 });
    }

    if (IS_CLOUD_RUN) {
      // Production: forward to vef-proxy via identity token
      const client = await idTokenAuth.getIdTokenClient(PROXY_URL);
      const response = await client.request({
        url: `${PROXY_URL}/proxy?name=${encodeURIComponent(operationName)}`,
        method: "GET",
      });
      return NextResponse.json(response.data, { status: response.status });
    } else {
      // Local: call Vertex AI directly
      const client = await directAuth.getClient();
      const projectId = await directAuth.getProjectId();
      const { token } = await client.getAccessToken();
      const sanitized = operationName.startsWith("/") ? operationName.slice(1) : operationName;
      const endpoint = `https://${API.DEFAULT_REGION}-aiplatform.googleapis.com/v1/${sanitized}`;
      const response = await fetch(endpoint, {
        method: "GET",
        headers: { "Authorization": `Bearer ${token}`, "X-Goog-User-Project": projectId },
      });
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }
  } catch (error: any) {
    console.error("[Proxy GET]", error.message);
    return NextResponse.json({ error: "Internal proxy error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { endpoint, payload } = await request.json();
    if (!endpoint || !payload) {
      return NextResponse.json({ error: "Missing endpoint or payload" }, { status: 400 });
    }

    if (IS_CLOUD_RUN) {
      // Production: forward to vef-proxy via identity token
      const client = await idTokenAuth.getIdTokenClient(PROXY_URL);
      const response = await client.request({
        url: `${PROXY_URL}/proxy`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        data: { endpoint, payload },
      });
      return NextResponse.json(response.data, { status: response.status });
    } else {
      // Local: call Vertex AI directly
      const client = await directAuth.getClient();
      const projectId = await directAuth.getProjectId();
      const { token } = await client.getAccessToken();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "X-Vertex-AI-LLM-Request-Type": API.VERTEX_REQUEST_TYPE,
          "X-Goog-User-Project": projectId,
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }
  } catch (error: any) {
    console.error("[Proxy POST]", error.message);
    return NextResponse.json({ error: "Internal proxy error" }, { status: 500 });
  }
}
