const rateLimit = require("express-rate-limit");

const { env, requireEnv } = require("../config/env");
const { asyncHandler } = require("../utils/asyncHandler");
const { HttpError } = require("../utils/httpError");

function normalizeBaseUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function extractAssistantText(json) {
  const out = json?.output;
  if (!Array.isArray(out)) return null;

  const parts = [];
  for (const item of out) {
    if (!item) continue;
    if (item.type !== "message") continue;
    const content = item.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (!c) continue;
      if (typeof c.text === "string" && (c.type === "output_text" || c.type === "text")) {
        parts.push(c.text);
      }
    }
  }
  return parts.length ? parts.join("\n").trim() : null;
}

function extractGeminiText(json) {
  const candidates = json?.candidates;
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const parts = candidates[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const texts = parts.map((p) => (typeof p?.text === "string" ? p.text : "")).filter(Boolean);
  return texts.length ? texts.join("\n").trim() : null;
}

function extractOllamaText(json) {
  if (typeof json?.message?.content === "string" && json.message.content.trim()) return json.message.content.trim();
  if (typeof json?.response === "string" && json.response.trim()) return json.response.trim();
  return null;
}

function basicRuleBasedAnswer(message) {
  const text = String(message || "").toLowerCase();

  if (!text.trim()) {
    return "Hi! Ask me about using Nexa Build – for example login, creating projects, floor plans, 3D view, or placing furniture.";
  }

  if (text.includes("login") || text.includes("log in") || text.includes("sign in")) {
    return [
      "To log in:",
      "1) Click the **Login** button in the top-right.",
      "2) Enter your email and password.",
      "3) If you don’t have an account yet, click **Sign up** first.",
    ].join("\n");
  }

  if (text.includes("sign up") || text.includes("register") || text.includes("create account")) {
    return [
      "To create an account:",
      "1) Click **Sign up** in the top-right.",
      "2) Fill in your name, email, and password.",
      "3) Submit the form – then you can log in and start creating projects.",
    ].join("\n");
  }

  if (text.includes("project") || text.includes("new design") || text.includes("create design")) {
    return [
      "To create a new project:",
      "1) Go to the **Projects** or **Dashboard** page.",
      "2) Click **New Project** (or similar button).",
      "3) Give it a name and choose the type (e.g. house, room).",
      "4) Open the project to start editing the floor plan and 3D view.",
    ].join("\n");
  }

  if (text.includes("floor") || text.includes("plan") || text.includes("walls")) {
    return [
      "To work with the floor plan:",
      "1) Open your project and go to the **Floor Plan / Room Planner** view.",
      "2) Use the toolbar to add **walls**, **rooms**, and **openings**.",
      "3) Drag points to adjust lengths and shapes.",
      "4) When you’re happy with the layout, switch to **3D view** to see it in 3D.",
    ].join("\n");
  }

  if (text.includes("3d") || text.includes("camera") || text.includes("orbit") || text.includes("zoom")) {
    return [
      "To use the 3D view:",
      "1) Switch to the **3D** tab or view in your project.",
      "2) Rotate the camera by dragging with the mouse or touch.",
      "3) Zoom with the mouse wheel or pinch.",
      "4) Pan by dragging with the right mouse button (or two-finger drag on a trackpad).",
    ].join("\n");
  }

  if (text.includes("furniture") || text.includes("sofa") || text.includes("bed") || text.includes("chair")) {
    return [
      "To place furniture:",
      "1) Open a project and go to the **Design / Furniture** section.",
      "2) Choose a furniture category (sofa, bed, table, etc.).",
      "3) Drag an item into the room.",
      "4) Rotate or move it until it fits your layout.",
    ].join("\n");
  }

  if (text.includes("save") || text.includes("progress") || text.includes("autosave")) {
    return [
      "About saving your work:",
      "1) Make sure you are **logged in**.",
      "2) Use the **Save** button in the project view (if available) or check that autosave is working.",
      "3) Reopen the same project later from the **Projects** page to continue editing.",
    ].join("\n");
  }

  if (text.includes("error") || text.includes("not working") || text.includes("cant") || text.includes("cannot")) {
    return [
      "Let’s troubleshoot:",
      "1) Try refreshing the page and checking your internet connection.",
      "2) Make sure you are logged in.",
      "3) If you see a specific error message, tell me exactly what it says.",
      "4) If the issue continues, try another browser or clear cache.",
    ].join("\n");
  }

  return [
    "I'm a simple built-in helper (no external AI).",
    "I can answer common questions about logging in, projects, floor plans, 3D view, furniture, and saving.",
    "Please describe what you’re trying to do in Nexa Build, and I’ll give step‑by‑step guidance.",
  ].join("\n");
}

function toRole(r) {
  const role = String(r || "").toLowerCase();
  if (role === "system" || role === "user" || role === "assistant") return role;
  return null;
}

async function fetchJsonWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: controller.signal });
    const json = await r.json().catch(() => null);
    return { r, json };
  } finally {
    clearTimeout(timer);
  }
}

function registerAiRoutes(app) {
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  const handler = asyncHandler(async (req, res) => {
      const body = req.body || {};
      const message = typeof body.message === "string" ? body.message.trim() : "";
      const history = Array.isArray(body.messages) ? body.messages : [];

      const instructions =
        "You are an AI assistant embedded in the Nexa Build web app. Help users use the site: login/signup, projects, floor plan tools (walls, curves, rooms, outdoor, road), 3D view, furniture placement, saving, and common errors. Be concise and step-by-step. If you need more info, ask a clarifying question.";

      // Keep a small window of history to reduce token usage.
      const slice = history.slice(-12);
      const input = [];
      const ollamaMessages = [{ role: "system", content: instructions }];
      for (const m of slice) {
        const role = toRole(m?.role);
        const text = typeof m?.text === "string" ? m.text : typeof m?.content === "string" ? m.content : "";
        const content = String(text || "").trim();
        if (!role || !content) continue;
        if (role === "system") continue;
        ollamaMessages.push({ role, content });
        input.push({
          type: "message",
          role,
          content: [{ type: "input_text", text: content }],
        });
      }

      if (message) {
        ollamaMessages.push({ role: "user", content: message });
        input.push({
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: message }],
        });
      }

      // Prefer Ollama if configured (self-hosted, no API key).
      const ollamaBaseUrl = normalizeBaseUrl(env.OLLAMA_BASE_URL);
      if (ollamaBaseUrl) {
        const model = env.OLLAMA_MODEL || "llama3";

        // Try chat API first; fall back to generate if older Ollama.
        const { r, json } = await fetchJsonWithTimeout(
          `${ollamaBaseUrl}/api/chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages: ollamaMessages, stream: false }),
          },
          25_000
        );

        if (r.ok) {
          const text = extractOllamaText(json) || "Sorry — I couldn't generate a response.";
          res.json({ message: text, provider: "ollama", model });
          return;
        }

        // If chat isn't available, try generate.
        const transcript = [
          `System: ${instructions}`,
          ...ollamaMessages
            .filter((m) => m.role !== "system")
            .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`),
        ]
          .filter(Boolean)
          .join("\n");

        const gen = await fetchJsonWithTimeout(
          `${ollamaBaseUrl}/api/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, prompt: transcript, stream: false }),
          },
          25_000
        );

        if (!gen.r.ok) {
          const msg =
            typeof gen.json?.error === "string"
              ? gen.json.error
              : typeof json?.error === "string"
                ? json.error
                : `Ollama request failed (${gen.r.status})`;
          throw new HttpError(502, msg);
        }

        const text = extractOllamaText(gen.json) || "Sorry — I couldn't generate a response.";
        res.json({ message: text, provider: "ollama", model });
        return;
      }

      // Prefer Gemini if configured, otherwise fall back to OpenAI.
      if (env.GEMINI_API_KEY) {
        const model = env.GEMINI_MODEL || "gemini-2.0-flash";

        const transcript = [
          `System: ${instructions}`,
          ...input.map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content?.[0]?.text || ""}`),
        ]
          .filter(Boolean)
          .join("\n");

        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-goog-api-key": requireEnv("GEMINI_API_KEY"),
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [{ text: transcript }],
                },
              ],
            }),
          }
        );

        const json = await r.json().catch(() => null);
        if (!r.ok) {
          const msg =
            typeof json?.error?.message === "string"
              ? json.error.message
              : `Gemini request failed (${r.status})`;
          throw new HttpError(502, msg);
        }

        const text = extractGeminiText(json) || "Sorry — I couldn't generate a response.";
        res.json({ message: text });
        return;
      }

      if (env.OPENAI_API_KEY) {
        const model = env.OPENAI_MODEL || "gpt-4o-mini";

        const r = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            instructions,
            input,
            max_output_tokens: 500,
            store: false,
          }),
        });

        const json = await r.json().catch(() => null);
        if (!r.ok) {
          const msg =
            typeof json?.error?.message === "string" ? json.error.message : `OpenAI request failed (${r.status})`;
          throw new HttpError(502, msg);
        }

        const text = extractAssistantText(json) || "Sorry — I couldn't generate a response.";
        res.json({ message: text });
        return;
      }

      // Fallback: no Ollama/Gemini/OpenAI configured – use simple rule-based helper.
      const fallback = basicRuleBasedAnswer(message);
      res.json({ message: fallback, provider: "rules" });
  });

  // Support both `/ai/*` and `/api/ai/*` so clients can use either base path.
  app.post("/ai/chat", limiter, handler);
  app.post("/api/ai/chat", limiter, handler);
}

module.exports = { registerAiRoutes };
