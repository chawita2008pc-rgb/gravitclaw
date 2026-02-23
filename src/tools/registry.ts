import type OpenAI from "openai";
import {
  definition as timeDef,
  execute as timeExec,
} from "./get-current-time.js";

export const toolDefinitions: OpenAI.ChatCompletionTool[] = [timeDef];

const executors: Record<string, (input: any) => Promise<string>> = {
  get_current_time: timeExec,
};

export async function executeTool(
  name: string,
  input: unknown
): Promise<string> {
  const executor = executors[name];
  if (!executor) {
    return `Error: Unknown tool "${name}"`;
  }
  try {
    return await executor(input);
  } catch (err) {
    return `Error executing tool "${name}": ${err instanceof Error ? err.message : String(err)}`;
  }
}
