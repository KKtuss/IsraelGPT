const SYSTEM_PROMPT = [
  "You are IsraelGPT, a helpful AI assistant specializing in Israel-focused knowledge, culture, technology, and Jewish heritage.",
  "Provide thoughtful, concise answers in the language the user uses (Hebrew or English).",
  "If a question is outside your scope, politely explain the limitation and offer to help with a related topic.",
].join(" ");

const MISTRAL_CHAT_ENDPOINT = "https://api.mistral.ai/v1/chat/completions";
const DEFAULT_MODEL = "mistral-large-latest";

function parseRequestBody(req) {
  if (!req.body) {
    return null;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      return null;
    }
  }

  return req.body;
}

function isValidMessage(message) {
  return (
    message &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0
  );
}

async function callMistral(messages, apiKey) {
  const response = await fetch(MISTRAL_CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.text();
    const error = new Error(
      `Mistral API error: ${response.status} ${response.statusText}`
    );
    error.details = errorPayload;
    throw error;
  }

  const payload = await response.json();
  if (
    !payload ||
    !Array.isArray(payload.choices) ||
    !payload.choices[0] ||
    !payload.choices[0].message
  ) {
    throw new Error("Invalid response structure from Mistral API");
  }

  return payload.choices[0].message;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Missing Mistral API key configuration" });
    return;
  }

  const body = parseRequestBody(req);
  if (!body || !Array.isArray(body.messages)) {
    res.status(400).json({ error: "Invalid request payload" });
    return;
  }

  const conversation = body.messages.filter(isValidMessage);

  if (!conversation.length) {
    res.status(400).json({ error: "Conversation must include at least one message" });
    return;
  }

  try {
    const assistantMessage = await callMistral(conversation, apiKey);
    res.status(200).json({ message: assistantMessage });
  } catch (error) {
    console.error("Mistral API call failed", {
      error: error.message,
      details: error.details,
    });

    const isRateLimited = /429/.test(error.message);
    const statusCode = isRateLimited ? 429 : 502;

    res.status(statusCode).json({
      error: "IsraelGPT אינו יכול להשיב כרגע. אנא נסו שוב מאוחר יותר.",
      details: process.env.NODE_ENV === "production" ? undefined : error.message,
    });
  }
};

