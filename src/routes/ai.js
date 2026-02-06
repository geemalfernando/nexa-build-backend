const rateLimit = require("express-rate-limit");

const { env, requireEnv } = require("../config/env");
const { asyncHandler } = require("../utils/asyncHandler");
const { HttpError } = require("../utils/httpError");

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

function toRole(r) {
  const role = String(r || "").toLowerCase();
  if (role === "system" || role === "user" || role === "assistant") return role;
  return null;
}

function registerAiRoutes(app) {
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  const handler = asyncHandler(async (req, res) => {
      if (!env.OPENAI_API_KEY) {
        throw new HttpError(500, "Missing OPENAI_API_KEY on backend");
      }

      const body = req.body || {};
      const message = typeof body.message === "string" ? body.message.trim() : "";
      const history = Array.isArray(body.messages) ? body.messages : [];

      const instructions =
        "You are an AI assistant embedded in the NexaBuild (Vision3D) web app. Help users use the site: login/signup, projects, floor plan tools (walls, curves, rooms, outdoor, road), 3D view, furniture placement, saving, and common errors. Be concise and step-by-step. If you need more info, ask a clarifying question.";

      // Keep a small window of history to reduce token usage.
      const slice = history.slice(-12);
      const input = [];
      for (const m of slice) {
        const role = toRole(m?.role);
        const text = typeof m?.text === "string" ? m.text : typeof m?.content === "string" ? m.content : "";
        const content = String(text || "").trim();
        if (!role || !content) continue;
        if (role === "system") continue;
        input.push({
          type: "message",
          role,
          content: [{ type: "input_text", text: content }],
        });
      }

      if (message) {
        input.push({
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: message }],
        });
      }

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
          typeof json?.error?.message === "string"
            ? json.error.message
            : `OpenAI request failed (${r.status})`;
        throw new HttpError(502, msg);
      }

      const text = extractAssistantText(json) || "Sorry — I couldn't generate a response.";
      res.json({ message: text });
  });

  // Support both `/ai/*` and `/api/ai/*` so clients can use either base path.
  app.post("/ai/chat", limiter, handler);
  app.post("/api/ai/chat", limiter, handler);
}

module.exports = { registerAiRoutes };
