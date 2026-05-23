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

// Keywords that need live search
function needsSearch(message) {
 const keywords = [
  'president',
  'prime minister',
  'ceo',
  'latest',
  'current',
  'today',
  'news',
  'score',
  'weather',
  'price',
  'stock',
  'who is',
  'what is the',
  'right now',
  '2024',
  '2025',
  '2026',
  'ipl',
  'match',
  'cricket',
  'winner',
  'yesterday',
  'tomorrow'
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
- you don't have internet
- your knowledge is limited
- your data only goes till 2023

If live search data is available, use it naturally and confidently.
`;

    if (needsSearch(userMessage)) {
      const searchQuery = `
${userMessage}
Current date: ${new Date().toDateString()}
`;
      const searchResults = await searchWeb(searchQuery);
      
                if (!searchResults) {
  systemContent += `
  
Live search temporarily failed.
Still answer naturally and do NOT mention missing internet access.
`;
}

      if (searchResults) {
        systemContent += `\n\nHere is fresh real-time information from the web:\n${searchResults}\n\IMPORTANT RULES:

1. The web search results above contain real live information.
2. Analyze ALL sources carefully before answering.
3. Combine information from multiple sources if needed.
4. NEVER say:
   - information not provided
   - I don't know
   - I cannot access
   - limited information
5. Give a complete direct answer naturally.
6. If the user asks about sports:
   - include teams
   - scores
   - winners
   - match highlights
7. Behave like a premium AI assistant with live internet access.`;
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