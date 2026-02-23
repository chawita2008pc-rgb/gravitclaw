import { saveMessage, getRecentMessages, updatePineconeId } from "./store.js";
import {
  ensureIndex,
  upsertMessage,
  searchMemory,
  type MemoryRecord,
} from "./pinecone.js";
import type { Config } from "../config.js";

export interface Memory {
  init(): Promise<void>;
  remember(role: "user" | "assistant", content: string): Promise<void>;
  recall(query: string, topK?: number): Promise<MemoryRecord[]>;
  getRecentContext(limit?: number): { role: string; content: string }[];
}

export function createMemory(config: Config): Memory {
  return {
    async init() {
      // Initialize SQLite (sync, runs on import)
      const { getDb } = await import("./store.js");
      getDb();

      // Ensure Pinecone index exists
      await ensureIndex(config.pineconeApiKey);
      console.log("Memory system initialized.");
    },

    async remember(role: "user" | "assistant", content: string) {
      // Save locally first
      const messageId = saveMessage(role, content);
      const pineconeId = `msg-${messageId}`;
      const timestamp = new Date().toISOString();

      // Update local record with Pinecone ID
      updatePineconeId(messageId, pineconeId);

      // Upsert to Pinecone (fire and forget — don't block the response)
      upsertMessage(
        config.pineconeApiKey,
        pineconeId,
        content,
        role,
        timestamp
      ).catch((err) => {
        console.error("Failed to upsert to Pinecone:", err);
      });
    },

    async recall(query: string, topK: number = 5): Promise<MemoryRecord[]> {
      try {
        return await searchMemory(config.pineconeApiKey, query, topK);
      } catch (err) {
        console.error("Failed to search Pinecone:", err);
        return [];
      }
    },

    getRecentContext(limit: number = 10): { role: string; content: string }[] {
      return getRecentMessages(limit).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
    },
  };
}
