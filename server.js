import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { tavily } from "@tavily/core";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Search helper
async function searchWeb(query) {
  try {
    const client = tavily({ apiKey: process.env.TAVILY_API_KEY });
    const result = await client.search(query, {
      maxResults: 5,
      searchDepth: "advanced"
    });
    return result.results
      .map((r, i) => `
SOURCE ${i + 1}
Title: ${r.title}
Content: ${r.content}
URL: ${r.url}
`)
      .join("\n\n");
  } catch (err) {
    return null;
  }
}

// Build a smart focused search query
function buildSearchQuery(message) {
  const msg = message.toLowerCase();
  const today = new Date();
  const dateStr = today.toDateString();
  const day = today.getDate();
  const month = today.toLocaleString('default', { month: 'long' });
  const year = today.getFullYear();

  // Sports / IPL
  if (msg.includes('ipl') || msg.includes('cricket')) {
    return `IPL 2025 match result score winner ${dateStr}`;
  }
  if (msg.includes('yesterday') && (msg.includes('match') || msg.includes('game'))) {
    return `IPL match result yesterday ${day} ${month} ${year}`;
  }
  if (msg.includes('score') || msg.includes('result') || msg.includes('winner')) {
    return `${message} ${dateStr} result score`;
  }

  // News
  if (msg.includes('news') || msg.includes('latest') || msg.includes('today')) {
    return `${message} ${day} ${month} ${year}`;
  }

  // Weather
  if (msg.includes('weather')) {
    return `weather forecast ${message} today ${dateStr}`;
  }

  // Stock / price
  if (msg.includes('stock') || msg.includes('price')) {
    return `${message} price today ${year}`;
  }

  // People / roles
  if (msg.includes('who is') || msg.includes('president') || msg.includes('prime minister') || msg.includes('ceo')) {
    return `${message} ${year} current`;
  }

  // Default — add date for freshness
  return `${message} ${dateStr}`;
}

// Keywords that need live search
function needsSearch(message) {
  const keywords = [
    'president', 'prime minister', 'ceo', 'latest', 'current',
    'today', 'news', 'score', 'weather', 'price', 'stock',
    'who is', 'what is the', 'right now', '2024', '2025', '2026',
    'ipl', 'match', 'cricket', 'football', 'winner', 'yesterday',
    'tomorrow', 'result', 'game', 'tournament', 'series', 'live'
  ];
  return keywords.some(k => message.toLowerCase().includes(k));
}

// Chat endpoint
app.post("/chat", async (req, res) => {
  try {
    const messages = req.body.messages || [];
    const userMessage = messages[messages.length - 1]?.content || "";

    let systemContent = `
You are NightMind, a futuristic AI assistant with real-time internet access.
Today's date is ${new Date().toDateString()}.
NEVER say:
- you don't have internet access
- your knowledge is limited
- your training data only goes till a certain date
If live search data is provided, use it naturally and confidently as if you searched it yourself.
Always give complete, direct, confident answers.
`;

    if (needsSearch(userMessage)) {
      const searchQuery = buildSearchQuery(userMessage);
      console.log("🔍 Search query:", searchQuery);

      const searchResults = await searchWeb(searchQuery);

      if (searchResults) {
        systemContent += `

==== LIVE WEB SEARCH RESULTS ====
Query used: "${searchQuery}"

${searchResults}
==== END OF SEARCH RESULTS ====

IMPORTANT RULES:
1. The search results above are real live data from the internet RIGHT NOW.
2. Read ALL sources carefully and combine information.
3. ALWAYS extract and mention:
   - For sports: teams, scores, winner, key players, highlights
   - For news: main event, who/what/when/where
   - For weather: temperature, conditions, forecast
   - For stocks/prices: current value, change
   - For people/roles: full name, title, since when
4. NEVER say "information not provided", "I don't know", "I cannot access", or "not specified".
5. If a source has partial info, combine with other sources to give a full answer.
6. Answer naturally as if you personally searched the web and found this data.
`;
      } else {
        systemContent += `
Live search temporarily failed. Answer using your best knowledge and today's date context.
Do NOT mention that search failed or that you lack internet access.
`;
      }
    }

    const updatedMessages = [
      { role: "system", content: systemContent },
      ...messages.filter(m => m.role !== "system")
    ];

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          ...req.body,
          messages: updatedMessages
        }),
      }
    );

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