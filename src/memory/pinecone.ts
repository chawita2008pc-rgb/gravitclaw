import { Pinecone } from "@pinecone-database/pinecone";

const INDEX_NAME = "gravity-claw";
const EMBEDDING_MODEL = "multilingual-e5-large";
const DIMENSION = 1024; // multilingual-e5-large dimension

let pineconeClient: Pinecone | null = null;

export function getPinecone(apiKey: string): Pinecone {
  if (pineconeClient) return pineconeClient;
  pineconeClient = new Pinecone({ apiKey });
  return pineconeClient;
}

export async function ensureIndex(apiKey: string): Promise<void> {
  const pc = getPinecone(apiKey);
  const indexes = await pc.listIndexes();
  const exists = indexes.indexes?.some((idx) => idx.name === INDEX_NAME);

  if (!exists) {
    console.log(`Creating Pinecone index "${INDEX_NAME}"...`);
    await pc.createIndex({
      name: INDEX_NAME,
      dimension: DIMENSION,
      metric: "cosine",
      spec: {
        serverless: {
          cloud: "aws",
          region: "us-east-1",
        },
      },
    });
    // Wait for index to be ready
    console.log("Waiting for index to be ready...");
    await waitForIndex(pc);
    console.log("Pinecone index ready.");
  }
}

async function waitForIndex(pc: Pinecone): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const desc = await pc.describeIndex(INDEX_NAME);
    if (desc.status?.ready) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Pinecone index failed to become ready within 2 minutes");
}

export async function embedText(apiKey: string, text: string): Promise<number[]> {
  const pc = getPinecone(apiKey);
  const result = await pc.inference.embed(EMBEDDING_MODEL, [text], {
    inputType: "passage",
  });
  const embedding = result.data?.[0];
  if (!embedding || !embedding.values) {
    throw new Error("Failed to generate embedding");
  }
  return embedding.values as number[];
}

export async function embedQuery(apiKey: string, text: string): Promise<number[]> {
  const pc = getPinecone(apiKey);
  const result = await pc.inference.embed(EMBEDDING_MODEL, [text], {
    inputType: "query",
  });
  const embedding = result.data?.[0];
  if (!embedding || !embedding.values) {
    throw new Error("Failed to generate embedding");
  }
  return embedding.values as number[];
}

export interface MemoryRecord {
  id: string;
  text: string;
  role: string;
  timestamp: string;
  score: number;
}

export async function upsertMessage(
  apiKey: string,
  id: string,
  text: string,
  role: string,
  timestamp: string
): Promise<void> {
  const pc = getPinecone(apiKey);
  const index = pc.index(INDEX_NAME);
  const values = await embedText(apiKey, text);

  await index.upsert([
    {
      id,
      values,
      metadata: { text, role, timestamp },
    },
  ]);
}

export async function searchMemory(
  apiKey: string,
  query: string,
  topK: number = 10
): Promise<MemoryRecord[]> {
  const pc = getPinecone(apiKey);
  const index = pc.index(INDEX_NAME);
  const queryVector = await embedQuery(apiKey, query);

  const results = await index.query({
    vector: queryVector,
    topK,
    includeMetadata: true,
  });

  return (results.matches || []).map((match) => ({
    id: match.id,
    text: (match.metadata?.text as string) || "",
    role: (match.metadata?.role as string) || "",
    timestamp: (match.metadata?.timestamp as string) || "",
    score: match.score || 0,
  }));
}
