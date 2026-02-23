import "dotenv/config";
import { loadConfig } from "./config.js";
import { createOpenAI } from "./agent.js";
import { createBot } from "./bot.js";
import { createMemory } from "./memory/index.js";

const config = loadConfig();
const client = createOpenAI(config);
const memory = createMemory(config);

await memory.init();

const bot = createBot(config, client, memory);

bot.start({
  onStart: () => console.log(`Gravity Claw is online. Model: ${config.llmModel}`),
});

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());
