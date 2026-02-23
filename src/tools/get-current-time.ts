import type OpenAI from "openai";

export const definition: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_current_time",
    description:
      "Get the current date and time. Optionally specify an IANA timezone (e.g. 'Asia/Bangkok', 'America/New_York'). If no timezone is provided, returns the server's local time.",
    parameters: {
      type: "object",
      properties: {
        timezone: {
          type: "string",
          description:
            "IANA timezone name, e.g. 'America/New_York', 'Asia/Bangkok', 'Europe/London'",
        },
      },
      required: [],
    },
  },
};

export async function execute(input: {
  timezone?: string;
}): Promise<string> {
  const tz =
    input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  const formatted = now.toLocaleString("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "long",
  });
  return `Current time in ${tz}: ${formatted}`;
}
