import { Bot, Context } from "grammy";
import type OpenAI from "openai";
import { runAgentLoop } from "./agent.js";
import { transcribeVoice } from "./voice.js";
import type { Config } from "./config.js";
import type { Memory } from "./memory/index.js";

export function createBot(config: Config, client: OpenAI, memory: Memory): Bot {
  const bot = new Bot(config.telegramBotToken);

  // Serialization lock — process one message at a time
  let processingLock: Promise<void> = Promise.resolve();

  // Auth middleware — silently ignore unauthorized users
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || !config.allowedUserIds.has(userId)) {
      return;
    }
    await next();
  });

  // /start command
  bot.command("start", async (ctx) => {
    await ctx.reply("Gravity Claw online. Send me a message, or use /setup to personalize my memory.");
  });

  // /setup command
  bot.command("setup", async (ctx) => {
    const prompt = "Welcome to Gravity Claw. Let's get you set up.\n\nTo build my core memory, please tell me a bit about yourself. What is your name, what do you do for work, and what are your primary interests?";
    await ctx.reply(prompt);
  });

  // Text message handler
  bot.on("message:text", (ctx) => {
    processingLock = processingLock.then(() =>
      handleMessage(ctx, client, config, memory)
    );
  });

  // Voice message handler
  bot.on("message:voice", (ctx) => {
    processingLock = processingLock.then(() =>
      handleVoiceMessage(ctx, client, config, memory)
    );
  });

  // Catch-all error handler
  bot.catch((err) => {
    console.error("Unhandled bot error:", err);
  });

  return bot;
}

async function handleMessage(
  ctx: Context,
  client: OpenAI,
  config: Config,
  memory: Memory
): Promise<void> {
  const text = ctx.message?.text;
  if (!text) return;

  try {
    await ctx.replyWithChatAction("typing");
    await memory.remember("user", text);
    const response = await runAgentLoop(text, client, config, memory);
    await memory.remember("assistant", response);
    await sendLongMessage(ctx, response);
  } catch (err) {
    console.error("Error processing message:", err);
    await ctx.reply("Something went wrong. Please try again.").catch(() => { });
  }
}

async function handleVoiceMessage(
  ctx: Context,
  client: OpenAI,
  config: Config,
  memory: Memory
): Promise<void> {
  try {
    await ctx.replyWithChatAction("typing");

    // Download the voice file from Telegram
    const file = await ctx.getFile();
    const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
    const response = await fetch(fileUrl);
    const buffer = Buffer.from(await response.arrayBuffer());

    // Transcribe with Groq Whisper
    const transcript = await transcribeVoice(buffer, config.groqApiKey);

    if (!transcript) {
      await ctx.reply("I couldn't make out what you said. Try again?");
      return;
    }

    // Echo back the transcription
    await ctx.reply(`I heard: "${transcript}"`);

    await memory.remember("user", transcript);

    // Now feed the transcript to the LLM as if it were a text message
    await ctx.replyWithChatAction("typing");
    const llmResponse = await runAgentLoop(transcript, client, config, memory);
    await memory.remember("assistant", llmResponse);
    await sendLongMessage(ctx, llmResponse);
  } catch (err) {
    console.error("Error processing voice message:", err);
    await ctx.reply("Something went wrong processing your voice message.").catch(() => { });
  }
}

const TELEGRAM_MAX_LENGTH = 4096;

async function sendLongMessage(
  ctx: Context,
  text: string
): Promise<void> {
  if (text.length <= TELEGRAM_MAX_LENGTH) {
    await ctx.reply(text);
    return;
  }
  for (let i = 0; i < text.length; i += TELEGRAM_MAX_LENGTH) {
    await ctx.reply(text.slice(i, i + TELEGRAM_MAX_LENGTH));
  }
}
