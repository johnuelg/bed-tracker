import type { UIMessage } from "ai";

export const DEFAULT_ORCA_MODEL = "meta-llama/llama-3.1-8b-instruct:free";

const getMessageText = (message: UIMessage) =>
  message.parts.map((part) => (part.type === "text" ? part.text : "")).join("").trim();

export const requestOrcaChat = async ({
  messages,
  model = DEFAULT_ORCA_MODEL,
  max_tokens = 1_200,
  temperature = 0.2,
}: {
  messages: UIMessage[];
  model?: string;
  max_tokens?: number;
  temperature?: number;
}) => {
  const response = await fetch("/api/orca/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens,
      temperature,
      messages: messages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({ role: message.role, content: getMessageText(message) }))
        .filter((message) => message.content.length > 0),
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string } | string;
  };
  if (!response.ok) {
    const detail = typeof payload.error === "string" ? payload.error : payload.error?.message;
    throw new Error(detail || "OrcaRouter could not complete this request. Please retry or switch providers.");
  }
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("OrcaRouter returned an empty response. Please retry or switch providers.");
  return content;
};