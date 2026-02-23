import OpenAI from "openai";

export async function transcribeVoice(
  fileBuffer: Buffer,
  groqApiKey: string
): Promise<string> {
  const groq = new OpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: groqApiKey,
  });

  const file = new File([new Uint8Array(fileBuffer)], "voice.ogg", { type: "audio/ogg" });

  const transcription = await groq.audio.transcriptions.create({
    model: "whisper-large-v3",
    file,
    response_format: "text",
  });

  // response_format: "text" returns the raw string
  return (transcription as unknown as string).trim();
}
