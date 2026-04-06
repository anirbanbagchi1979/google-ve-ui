import express, { Request, Response } from "express";
import { GoogleAuth } from "google-auth-library";

const app = express();
app.use(express.json());

const auth = new GoogleAuth({
  scopes: "https://www.googleapis.com/auth/cloud-platform",
});

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// POST — forward generation / status check requests to Vertex AI
app.post("/proxy", async (req: Request, res: Response) => {
  try {
    const { endpoint, payload } = req.body;

    if (!endpoint || !payload) {
      res.status(400).json({ error: "Missing endpoint or payload" });
      return;
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
    res.status(response.status).json(data);
  } catch (error: any) {
    console.error("[vef-proxy POST] Error:", error.message);
    res.status(500).json({ error: "Internal proxy error" });
  }
});

// GET — poll a Vertex AI long-running operation
app.get("/proxy", async (req: Request, res: Response) => {
  try {
    const operationName = req.query.name as string;

    if (!operationName) {
      res.status(400).json({ error: "Missing operation name" });
      return;
    }

    const client = await auth.getClient();
    const projectId = await auth.getProjectId();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    const sanitized = operationName.startsWith("/")
      ? operationName.substring(1)
      : operationName;
    const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/${sanitized}`;

    console.log(`[vef-proxy GET] Polling: ${endpoint}`);

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-Goog-User-Project": projectId,
      },
    });

    const data = await response.json();
    if (response.status >= 400) {
      console.warn(`[vef-proxy GET] API Error (${response.status}):`, data);
    }
    res.status(response.status).json(data);
  } catch (error: any) {
    console.error("[vef-proxy GET] Error:", error.message);
    res.status(500).json({ error: "Internal proxy error" });
  }
});

const PORT = parseInt(process.env.PORT || "8080");
app.listen(PORT, () => {
  console.log(`vef-proxy listening on port ${PORT}`);
});
