const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");

// Node 18 sudah ada fetch global
const fetchFn = global.fetch;

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ================= MEMORY =================
const loadMemory = () => {
  try {
    const data = fs.readFileSync("memory.json", "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
};

const saveMemory = (data) => {
  fs.writeFileSync("memory.json", JSON.stringify(data, null, 2));
};

let memories = loadMemory();
let posts = [];

// ================= AI FUNCTION =================
const callAI = async (messages, temperature = 0.7) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      console.log("❌ GROQ_API_KEY belum di set");
      return null;
    }

    const response = await fetchFn(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature,
          messages
        })
      }
    );

    const data = await response.json();

    if (!data || data.error) {
      console.log("GROQ ERROR:", data);
      return null;
    }

    return data?.choices?.[0]?.message?.content || null;

  } catch (err) {
    console.log("FETCH ERROR:", err.message);
    return null;
  }
};

// ================= HOME =================
app.get("/", (req, res) => {
  res.send("AI Agent Groq running 🚀");
});

// ================= CHAT =================
app.post("/chat", async (req, res) => {
  try {
    const userId = req.body?.userId || "default";
    const userMessage = req.body?.message;

    if (!userMessage) {
      return res.json({ success: false, error: "Message kosong" });
    }

    if (!memories[userId]) memories[userId] = [];

    memories[userId].push({
      role: "user",
      content: userMessage
    });

    if (memories[userId].length > 20) memories[userId].shift();

    const reply = await callAI([
      {
        role: "system",
        content: "Kamu AI assistant yang ramah dan ingat percakapan user."
      },
      ...memories[userId]
    ]);

    if (!reply) {
      return res.json({ success: false, error: "AI tidak respon" });
    }

    memories[userId].push({
      role: "assistant",
      content: reply
    });

    if (memories[userId].length > 20) memories[userId].shift();

    saveMemory(memories);

    res.json({
      success: true,
      data: {
        reply: reply.trim(),
        action: "none"
      }
    });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ================= AGENT =================
app.post("/agent", async (req, res) => {
  try {
    const { input, userId } = req.body;

    if (!input) {
      return res.json({ success: false, error: "input kosong" });
    }

    const raw = await callAI([
      {
        role: "system",
        content: `
Kamu AI Agent.

Tugas:
- pahami intent user
- tentukan aksi (post/reply/none)

FORMAT JSON:
{
  "reply": "...",
  "action": "post | reply | none"
}
        `
      },
      {
        role: "user",
        content: input
      }
    ], 0.4);

    let result;

    try {
      result = JSON.parse(raw);
    } catch {
      result = { reply: raw || "", action: "none" };
    }

    res.json({
      success: true,
      agent: "moltbooks-agent-v1",
      userId: userId || null,
      data: result
    });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ================= POST =================
app.post("/post", (req, res) => {
  const { content } = req.body;

  if (!content) {
    return res.json({ success: false, error: "content kosong" });
  }

  const newPost = {
    id: Date.now(),
    content,
    comments: []
  };

  posts.push(newPost);

  res.json({
    success: true,
    post: newPost
  });
});

// ================= MOLTBOOK =================
app.post("/moltbook", async (req, res) => {
  try {
    const { event, agentId } = req.body;

    const raw = await callAI([
      {
        role: "system",
        content: `
Kamu AI moderator social network.

Tentukan:
- reply atau ignore

FORMAT JSON:
{
  "action": "reply | ignore",
  "content": "..."
}
        `
      },
      {
        role: "user",
        content: JSON.stringify(event)
      }
    ], 0.4);

    let result;

    try {
      result = JSON.parse(raw);
    } catch {
      result = { action: "ignore", content: null };
    }

    if (!result.action) result.action = "ignore";

    res.json({
      success: true,
      agentId: agentId || "unknown",
      event,
      decision: result
    });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ================= SIMULATE =================
app.post("/simulate", async (req, res) => {
  try {
    if (posts.length === 0) {
      return res.json({ success: false, error: "belum ada post" });
    }

    const post = posts[posts.length - 1];

    const raw = await callAI([
      {
        role: "system",
        content: `
Kamu AI agent social media.

Reply atau ignore post.

FORMAT:
{
  "action": "reply | ignore",
  "content": "komentar"
}
        `
      },
      {
        role: "user",
        content: post.content
      }
    ], 0.4);

    let result;

    try {
      result = JSON.parse(raw);
    } catch {
      result = { action: "ignore" };
    }

    if (result.action === "reply" && result.content) {
      post.comments.push(result.content);
    }

    res.json({
      success: true,
      post
    });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ================= EXECUTE =================
app.post("/execute", (req, res) => {
  const { action, content } = req.body;

  if (action === "post") {
    const newPost = {
      id: Date.now(),
      content,
      comments: []
    };

    posts.push(newPost);

    return res.json({
      success: true,
      message: "post dibuat",
      post: newPost
    });
  }

  res.json({
    success: true,
    message: "tidak ada aksi"
  });
});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("AI running 🚀 on", PORT);
});