export interface Config {
  telegramBotToken: string;
  openrouterApiKey: string;
  groqApiKey: string;
  pineconeApiKey: string;
  allowedUserIds: Set<number>;
  maxAgentIterations: number;
  llmModel: string;
}

export function loadConfig(): Config {
  const telegramBotToken = requireEnv("TELEGRAM_BOT_TOKEN");
  const openrouterApiKey = requireEnv("OPENROUTER_API_KEY");
  const groqApiKey = requireEnv("GROQ_API_KEY");
  const pineconeApiKey = requireEnv("PINECONE_API_KEY");

  const rawIds = requireEnv("ALLOWED_USER_IDS");
  const allowedUserIds = new Set(
    rawIds.split(",").map((id) => {
      const parsed = Number(id.trim());
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid user ID: "${id.trim()}"`);
      }
      return parsed;
    })
  );

  if (allowedUserIds.size === 0) {
    throw new Error("ALLOWED_USER_IDS must contain at least one user ID");
  }

  return {
    telegramBotToken,
    openrouterApiKey,
    groqApiKey,
    pineconeApiKey,
    allowedUserIds,
    maxAgentIterations: 10,
    llmModel: process.env.LLM_MODEL?.trim() || "google/gemini-2.0-flash-exp:free",
  };
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}
