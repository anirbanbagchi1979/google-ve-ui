import { NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";

const PROXY_URL = process.env.PROXY_URL || "https://vef-proxy-uhz33244pa-uc.a.run.app";

// Used locally only — in Cloud Run, identity token is fetched via ADC
const auth = new GoogleAuth();

async function getIdTokenClient() {
  // In Cloud Run, this uses the attached service account to get an identity token
  // scoped to the proxy URL, satisfying Cloud Run's --no-allow-unauthenticated check
  return auth.getIdTokenClient(PROXY_URL);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const operationName = searchParams.get("name");

    if (!operationName) {
      return NextResponse.json({ error: "Missing operation name" }, { status: 400 });
    }

    const client = await getIdTokenClient();
    const response = await client.request({
      url: `${PROXY_URL}/proxy?name=${encodeURIComponent(operationName)}`,
      method: "GET",
    });

    return NextResponse.json(response.data, { status: response.status });
  } catch (error: any) {
    console.error("[route GET] Crash:", error.message);
    return NextResponse.json({ error: "Internal proxy error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { endpoint, payload } = await request.json();

    if (!endpoint || !payload) {
      return NextResponse.json({ error: "Missing endpoint or payload" }, { status: 400 });
    }

    const client = await getIdTokenClient();
    const response = await client.request({
      url: `${PROXY_URL}/proxy`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: { endpoint, payload },
    });

    return NextResponse.json(response.data, { status: response.status });
  } catch (error: any) {
    console.error("[route POST] Crash:", error.message);
    return NextResponse.json({ error: "Internal proxy error" }, { status: 500 });
  }
}
