import { generateObject } from "ai";
import { z } from "zod";
import { log } from "@/logging";
import { textContentSchema, type GenerationState, type PostprocessResult, type StormOptions } from "@/types";
import {
  articleSectionPromptTemplate
} from "@/prompt";
import { embed } from "ai";
import { shouldDedupe } from "@/dedupe";


/**
 * Checks if content is unique and regenerates it if needed
 * @returns PostProcessResult containing the final content and updated embeddings
 */
export async function ensureUnique<TContent = string>({
  options,
  state,
  content,
}: {
  options: StormOptions;
  state: GenerationState<TContent>;
  content: TContent[];
}): Promise<PostprocessResult<TContent>> {
  const maxAttempts = 3;

  // Early return if no embedding model is available
  if (!options.embeddingModel) {
    log("Skipping deduplication (no embedding model)");
    return { state, content };
  }

  // If no existing content, just embed and return
  if (state.contents.length === 0) {
    await embed({
      model: options.embeddingModel,
      value: content.join("\n")
    })
      .then(({ embedding }) => {
        state.embeddings.push(embedding);
      })
      .catch((error) => {
        log("Error embedding content", { error });
      });

    return { state, content };
  }

  // Try to generate unique content up to maxAttempts times
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Check for similarity with existing content
    const { should: shouldDeduplicate } = await shouldDedupe({
      model: options.embeddingModel,
      existing: state.contents.map(String),
      existingEmbeddings: state.embeddings,
      candidate: content.join("\n"),
      threshold: options.dedupeThreshold ?? 0.5
    }).catch((error) => {
      log("Error during deduplication check", { error });
      return { should: false };
    });

    const isLastAttempt = attempt >= maxAttempts;
    const isUnique = !shouldDeduplicate;

    // Log status
    if (shouldDeduplicate) {
      log(isLastAttempt
        ? "Max regeneration attempts reached, using current version"
        : "Content is too similar to existing content",
        { attempt, willRegenerate: !isLastAttempt }
      );
    } else {
      log("Content is unique enough", { attempt });
    }

    // If content is unique or this is our last attempt, embed and return
    if (isUnique || isLastAttempt) {
      await embed({
        model: options.embeddingModel,
        value: content.join("\n")
      })
        .then(({ embedding }) => {
          state.embeddings.push(embedding);
        })
        .catch((error) => {
          log("Error embedding content", { error });
        });

      return { state, content };
    }

    // Need to regenerate - content is too similar
    log(`Regenerating section (attempt ${attempt + 1}) due to similarity`);

    // Generate new content
    const generateResult = await generateObject({
      model: options.model,
      schema: z.object({
        title: z.string(),
        description: z.string(),
        content: textContentSchema.array(),
      }),
      prompt: articleSectionPromptTemplate.format({
        topic: state.topic,
        outlineItem: JSON.stringify(state.currentOutlineItem),
        lastK: JSON.stringify(state.sections.slice(-3)),
      }),
    }).catch((error) => {
      log("Error during content regeneration", { error, attempt });
      return null;
    });

    // If generation failed, return current content
    if (!generateResult) {
      return { state, content };
    }

    // Update content for next iteration
    content = generateResult.object.content as unknown as TContent[];
  }

  // This should never be reached due to the return statements above
  return { state, content };
}
