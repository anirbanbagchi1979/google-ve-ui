const express = require("express");
const { GoogleAuth } = require("google-auth-library");

const app = express();
app.use(express.json());

const auth = new GoogleAuth({
  scopes: "https://www.googleapis.com/auth/cloud-platform",
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/proxy", async (req, res) => {
  try {
    const { endpoint, payload } = req.body;
    if (!endpoint || !payload) {
      return res.status(400).json({ error: "Missing endpoint or payload" });
    }
    const client = await auth.getClient();
    const projectId = await auth.getProjectId();
    const { token } = await client.getAccessToken();

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
  } catch (err) {
    console.error("[vef-proxy POST]", err.message);
    res.status(500).json({ error: "Internal proxy error" });
  }
});

app.get("/proxy", async (req, res) => {
  try {
    const operationName = req.query.name;
    if (!operationName) {
      return res.status(400).json({ error: "Missing operation name" });
    }
    const client = await auth.getClient();
    const projectId = await auth.getProjectId();
    const { token } = await client.getAccessToken();

    const sanitized = operationName.startsWith("/") ? operationName.slice(1) : operationName;
    const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/${sanitized}`;

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-Goog-User-Project": projectId,
      },
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error("[vef-proxy GET]", err.message);
    res.status(500).json({ error: "Internal proxy error" });
  }
});

const PORT = parseInt(process.env.PORT || "8080");
app.listen(PORT, () => console.log(`vef-proxy listening on port ${PORT}`));
