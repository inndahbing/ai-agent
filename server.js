import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";

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
    const response = await fetch(
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
      console.log("ERROR GROQ:", data);
      return null;
    }

    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      return JSON.stringify({
        action: "ignore",
        content: null
      });
    }

    return content;

  } catch (err) {
    console.log("FETCH ERROR:", err.message);
    return null;
  }
};


// ================= HOME =================
app.get("/", (req, res) => {
  res.send("AI Agent Groq hidup 🚀");
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

    if (memories[userId].length > 20) {
      memories[userId].shift();
    }

    const reply = await callAI([
      {
        role: "system",
        content: "Kamu adalah AI assistant yang ramah dan ingat percakapan user."
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

    if (memories[userId].length > 20) {
      memories[userId].shift();
    }

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
Kamu adalah AI Agent.

Tugas:
- pahami maksud user
- tentukan aksi

ACTION:
- "post" → kalau user mau bikin post
- "reply" → kalau user mau balas
- "none" → kalau cuma ngobrol

FORMAT:
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
  result = {
    action: "ignore",
    content: null
  };
}

// VALIDATION (TARUH DI SINI)
if (!result.action || !["reply", "ignore"].includes(result.action)) {
  result.action = "ignore";
}

if (result.action === "reply" && !result.content) {
  result.action = "ignore";
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
    id: Date.now() + Math.random(), // ✅ FIX koma
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

   if (!result.action || !["reply", "ignore"].includes(result.action)) {
  result.action = "ignore";
}

if (result.action === "reply" && !result.content) {
  result.action = "ignore";
}

    const raw = await callAI([
      {
        role: "system",
        content: `
Tentukan reply atau ignore.

FORMAT:
{
  "action": "reply | ignore",
  "content": "..."
}`
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
      result = {
        action: "ignore",
        content: null
      };
    }

    res.json({
      success: true,
      agentId: agentId || "unknown-agent",
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
      return res.json({
        success: false,
        error: "belum ada post"
      });
    }

    const post = posts[posts.length - 1];

    const raw = await callAI([
      {
        role: "system",
        content: `
Kamu adalah AI agent di social media.

Lihat post ini, lalu:
- reply atau ignore

FORMAT JSON:
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
    res.json({
      success: false,
      error: err.message
    });
  }
});
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
app.listen(3000, () => {
  console.log("AI Agent Groq running 🚀 http://localhost:3000");
});