import { type EmbeddingModel, embedMany, embed, cosineSimilarity, type Embedding } from "ai";

interface Options {
  model: EmbeddingModel<string>;

  existing: string[];
  existingEmbeddings?: Embedding[];

  candidate: string;
  candidateEmbedding?: Embedding;

  threshold?: number;
}

export async function shouldDedupe(options: Options) {
  let { model, existing, candidate, threshold = 0.9, existingEmbeddings, candidateEmbedding } = options;

  if (!existingEmbeddings) {
    existingEmbeddings = await embedMany({
      model,
      values: existing,
    })
      .then(({ embeddings }) => embeddings);
  } else if (existingEmbeddings.length !== existing.length)
    throw new Error("Existing embeddings length does not match existing paragraphs length");


  if (!candidateEmbedding) {
    candidateEmbedding = await embed({
      model,
      value: candidate,
    })
      .then(({ embedding }) => embedding);
  }

  if (!existingEmbeddings)
    throw new Error("Failed to embed existing paragraphs");

  if (!candidateEmbedding)
    throw new Error("Failed to embed candidate");

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
