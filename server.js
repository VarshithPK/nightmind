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
      maxResults: 3,
      searchDepth: "basic"
    });
    return result.results
      .map(r => `${r.title}: ${r.content}`)
      .join("\n\n");
  } catch (err) {
    return null;
  }
}

// Keywords that need live search
function needsSearch(message) {
  const keywords = [
    'president', 'prime minister', 'ceo', 'latest', 'current',
    'today', 'news', 'score', 'weather', 'price', 'stock',
    'who is', 'what is the', 'right now', '2024', '2025', '2026'
  ];
  return keywords.some(k => message.toLowerCase().includes(k));
}

app.post("/chat", async (req, res) => {
  try {
    const messages = req.body.messages || [];
    const userMessage = messages[messages.length - 1]?.content || "";

    let systemContent = `You are NightMind, a futuristic AI assistant. Today's date is ${new Date().toDateString()}.`;

    // Add web search context if needed
    if (needsSearch(userMessage)) {
      const searchResults = await searchWeb(userMessage);
      if (searchResults) {
        systemContent += `\n\nHere is fresh real-time information from the web:\n${searchResults}\n\nIMPORTANT: Answer directly and confidently using ONLY this information. Do not say the information is not provided. Do not recommend other sources. Just answer the question directly from the data above.`;
      }
    }

    // Replace system message with updated one
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
    let systemContent = `You are NightMind, a futuristic AI assistant. Today's date is ${new Date().toDateString()}.`;

    // Add web search context if needed
    if (needsSearch(userMessage)) {
      const searchResults = await searchWeb(userMessage);
      if (searchResults) {
        systemContent += `\n\nHere is fresh real-time information from the web to answer accurately:\n${searchResults}\n\nUse this information to give an up to date answer.`;
      }
    }

    // Replace system message with updated one
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