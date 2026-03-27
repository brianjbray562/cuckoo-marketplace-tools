import express from "express";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env"), override: true });

const app = express();
const PORT = process.env.PORT || process.env.PROXY_PORT || 3001;
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY environment variable is required");
  process.exit(1);
}

app.use(express.json({ limit: "1mb" }));

// Auth: require the app login password as a Bearer token
const APP_PASSWORD = "cka2026$";
app.post("/api/messages", (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${APP_PASSWORD}`) {
    return res.status(401).json({ error: { message: "Unauthorized" } });
  }
  next();
});

// Proxy /api/messages → https://api.anthropic.com/v1/messages
app.post("/api/messages", async (req, res) => {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    res.status(response.status);
    for (const [key, value] of response.headers.entries()) {
      if (!["transfer-encoding", "connection", "content-encoding"].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }
    const body = await response.text();
    res.send(body);
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(502).json({ error: { message: "Proxy error: " + err.message } });
  }
});

// Serve built frontend in production
app.use(express.static(join(__dirname, "dist")));
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
