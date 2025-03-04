import { type EmbeddingModel, embedMany, cosineSimilarity } from "ai";

interface Options {
  model: EmbeddingModel<string>;
  existing: string[];
  candidate: string;
  threshold?: number;
}

export async function shouldDedupe(options: Options) {
  const { model, existing, candidate, threshold = 0.9 } = options;

  const { embeddings: [candidateEmbedding, ...existingEmbeddings] } = await embedMany({
    model,
    values: [candidate, ...existing],
  });

  if (!candidateEmbedding || !existingEmbeddings)
    throw new Error("Failed to embed candidate or existing paragraphs");

  const similarities = existingEmbeddings.map((embedding) => cosineSimilarity(candidateEmbedding, embedding));

  const similar = existing
    .map((paragraph, i) => ({
      paragraph,
      similarity: similarities[i]!,
    }))
    .filter(({ similarity }) => similarity >= threshold);

  return {
    similar,
    should: similar.length > 0,
  };
}
