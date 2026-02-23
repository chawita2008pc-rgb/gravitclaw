import OpenAI from "openai";
import { toolDefinitions, executeTool } from "./tools/registry.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import type { Config } from "./config.js";
import type { Memory } from "./memory/index.js";

export function createOpenAI(config: Config): OpenAI {
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: config.openrouterApiKey,
  });
}

export async function runAgentLoop(
  userMessage: string,
  client: OpenAI,
  config: Config,
  memory: Memory
): Promise<string> {
  const recentContext = memory.getRecentContext(10);
  const semanticMemories = await memory.recall(userMessage, 5);

  let contextPrompt = SYSTEM_PROMPT;

  if (semanticMemories.length > 0) {
    contextPrompt += "\n\nRelevant past memories (use this context to personalize your response and recall past details):\n";
    semanticMemories.forEach(mem => {
      contextPrompt += `- [${mem.timestamp}] ${mem.role}: ${mem.text}\n`;
    });
  }

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: contextPrompt },
    ...recentContext.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content
    })),
    { role: "user", content: userMessage },
  ];

  for (let i = 0; i < config.maxAgentIterations; i++) {
    const response = await client.chat.completions.create({
      model: config.llmModel,
      max_tokens: 2048,
      tools: toolDefinitions,
      messages,
    });

    const choice = response.choices[0];
    if (!choice) {
      return "(No response generated)";
    }

    const message = choice.message;

    // If no tool calls, we're done — return the text
    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content || "(No response generated)";
    }

    // Model wants to call tools — append its message first
    messages.push(message);

    // Execute each tool call and append results
    for (const toolCall of message.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments || "{}");
      const result = await executeTool(toolCall.function.name, args);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }

  return "I reached the maximum number of reasoning steps. Please try a simpler question.";
}
