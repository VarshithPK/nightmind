import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { tavily } from "@tavily/core";
import multer from "multer";
import fetch from "node-fetch";
import FormData from "form-data";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// multer stores audio in memory
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ======================================
// TRANSCRIBE ENDPOINT (Whisper via Groq)
// ======================================
app.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file received" });
    }

    const form = new FormData();
    form.append("file", req.file.buffer, {
      filename: "audio.webm",
      contentType: req.file.mimetype || "audio/webm",
    });
    form.append("model", "whisper-large-v3");
    form.append("response_format", "json");
    form.append("language", "en");

    const response = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          ...form.getHeaders(),
        },
        body: form,
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || "Transcription failed" });
    }

    res.json({ text: data.text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================================
// SEARCH HELPER
// ======================================
async function searchWeb(query) {
  try {
    const client = tavily({ apiKey: process.env.TAVILY_API_KEY });
    const result = await client.search(query, {
      maxResults: 5,
      searchDepth: "advanced",
    });
    return result.results
      .map((r, i) => `SOURCE ${i + 1}\nTitle: ${r.title}\nContent: ${r.content}\nURL: ${r.url}`)
      .join("\n\n");
  } catch (err) {
    return null;
  }
}

function buildSearchQuery(message) {
  const msg = message.toLowerCase();
  const today = new Date();
  const dateStr = today.toDateString();
  const day = today.getDate();
  const month = today.toLocaleString("default", { month: "long" });
  const year = today.getFullYear();

  if (msg.includes("ipl") || msg.includes("cricket"))
    return `IPL 2025 match result score winner ${dateStr}`;
  if (msg.includes("yesterday") && (msg.includes("match") || msg.includes("game")))
    return `IPL match result yesterday ${day} ${month} ${year}`;
  if (msg.includes("score") || msg.includes("result") || msg.includes("winner"))
    return `${message} ${dateStr} result score`;
  if (msg.includes("news") || msg.includes("latest") || msg.includes("today"))
    return `${message} ${day} ${month} ${year}`;
  if (msg.includes("weather"))
    return `weather forecast ${message} today ${dateStr}`;
  if (msg.includes("stock") || msg.includes("price"))
    return `${message} price today ${year}`;
  if (msg.includes("who is") || msg.includes("president") || msg.includes("prime minister") || msg.includes("ceo"))
    return `${message} ${year} current`;
  return `${message} ${dateStr}`;
}

function needsSearch(message) {
  const keywords = [
    "president", "prime minister", "ceo", "latest", "current",
    "today", "news", "score", "weather", "price", "stock",
    "who is", "what is the", "right now", "2024", "2025", "2026",
    "ipl", "match", "cricket", "football", "winner", "yesterday",
    "tomorrow", "result", "game", "tournament", "series", "live",
  ];
  return keywords.some((k) => message.toLowerCase().includes(k));
}

// ======================================
// CHAT ENDPOINT
// ======================================
app.post("/chat", async (req, res) => {
  try {
    const messages = req.body.messages || [];
    const userMessage = messages[messages.length - 1]?.content || "";

    let systemContent = `
You are NightMind, a futuristic AI assistant with real-time internet access.
Today's date is ${new Date().toDateString()}.
NEVER say you don't have internet access or that your knowledge is limited.
If live search data is provided, use it naturally and confidently.
`;

    if (needsSearch(userMessage)) {
      const searchQuery = buildSearchQuery(userMessage);
      console.log("🔍 Search query:", searchQuery);
      const searchResults = await searchWeb(searchQuery);

      if (searchResults) {
        systemContent += `\n\n==== LIVE WEB SEARCH RESULTS ====\n${searchResults}\n==== END ====\n
RULES:
1. Use the search results above to answer accurately.
2. Always extract teams, scores, winners for sports.
3. NEVER say "information not provided" or "I don't know".
4. Answer naturally as if you searched the web yourself.`;
      }
    }

    const updatedMessages = [
      { role: "system", content: systemContent },
      ...messages.filter((m) => m.role !== "system"),
    ];

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        ...req.body,
        messages: updatedMessages,
      }),
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`NightMind running on port ${port}`);
});