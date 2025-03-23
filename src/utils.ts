import type { LanguageModel } from "ai";
import { OpenAI } from "openai";
import { log } from "./logging";
import { type ArticleSection } from "./types";

interface NativeGenerateObjectOptions {
  model: LanguageModel;

  schema: any;
  schemaName: string;

  prompt: string;
}

export const openai = new OpenAI();

export const nativeGenerateObject = async <T>(options: NativeGenerateObjectOptions): Promise<{ object: T }> => {
  const { model, schema, schemaName, prompt } = options;

  if (!model.provider.includes("openai")) {
    throw new Error(`Model is not an OpenAI model: ${model.provider}`);
  }

  const response = await openai.beta.chat.completions.parse({
    model: model.modelId,
    messages: [{ role: "user", content: prompt }],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: schemaName,
        schema,
      },
    },
  })
    .catch((error) => {
      log("Error generating object", { error });
      throw error;
    });

  const [choice] = response.choices;

  if (!choice) {
    throw new Error("No choice returned");
  }

  if (!choice.message.parsed) {
    throw new Error("No parsed object returned");
  }

  return { object: choice.message.parsed };
};

/**
 * Counts tokens in a string using a simple approximation
 * Note: This is a rough estimation. For production, consider using a proper tokenizer.
 */
export const estimateTokenCount = (text: string): number => {
  if (!text || text.trim() === '') {
    return 0;
  }
  return Math.ceil(text.split(/\s+/).length * 1.3);
};

/**
 * Counts tokens in an article section
 */
export const countSectionTokens = (section: ArticleSection): number => {
  // Count tokens in the content
  let tokenCount = section.content.reduce((sum, paragraph) => {
    return sum + estimateTokenCount(typeof paragraph === 'string' ? paragraph : JSON.stringify(paragraph));
  }, 0);

  // Add tokens for title and description
  tokenCount += estimateTokenCount(section.title);
  tokenCount += estimateTokenCount(section.description);

  return tokenCount;
};

/**
 * Expands content to meet the token budget using an LLM
 */
export const expandContent = async (
  model: LanguageModel,
  section: ArticleSection,
  targetTokenCount: number
): Promise<string[]> => {
  log("Expanding content to meet token budget", {
    section: section.title,
    current: section.actualTokenCount,
    target: targetTokenCount
  });

  const response = await openai.chat.completions.create({
    model: model.modelId,
    messages: [
      {
        role: "system",
        content: "You are an expert content expander. You will be given content that needs to be expanded to meet a token budget. Maintain the original tone and style while adding relevant details, examples, or elaborations."
      },
      {
        role: "user",
        content: `Expand the following content to approximately ${targetTokenCount} tokens while maintaining quality and relevance. Current content has approximately ${section.actualTokenCount} tokens.

Title: ${section.title}
Description: ${section.description}
Content:
${section.content.join('\n\n')}

Provide only the expanded content paragraphs as your response, with each paragraph on a separate line.`
      }
    ]
  });

  const expandedContent = response.choices[0]?.message.content?.trim().split('\n\n') || section.content;
  log("Content expanded", { section: section.title, newParagraphCount: expandedContent.length });

  return expandedContent;
};

/**
 * Truncates content to meet the token budget using an LLM
 */
export const truncateContent = async (
  model: LanguageModel,
  section: ArticleSection,
  targetTokenCount: number
): Promise<string[]> => {
  log("Truncating content to meet token budget", {
    section: section.title,
    current: section.actualTokenCount,
    target: targetTokenCount
  });

  const response = await openai.chat.completions.create({
    model: model.modelId,
    messages: [
      {
        role: "system",
        content: "You are an expert content editor. You will be given content that needs to be condensed to meet a token budget. Preserve the most important information while making the content more concise."
      },
      {
        role: "user",
        content: `Condense the following content to approximately ${targetTokenCount} tokens while preserving the key information. Current content has approximately ${section.actualTokenCount} tokens.

Title: ${section.title}
Description: ${section.description}
Content:
${section.content.join('\n\n')}

Provide only the condensed content paragraphs as your response, with each paragraph on a separate line.`
      }
    ]
  });

  const truncatedContent = response.choices[0]?.message.content?.trim().split('\n\n') || section.content;
  log("Content truncated", { section: section.title, newParagraphCount: truncatedContent.length });

  return truncatedContent;
};

/**
 * Adjusts content to meet the token budget
 */
export const adjustContentToTokenBudget = async (
  model: LanguageModel,
  section: ArticleSection
): Promise<ArticleSection> => {
  if (!section.tokenBudget) {
    return section; // No budget defined, return as is
  }

  // Count tokens in the current section
  const currentTokenCount = countSectionTokens(section);
  section.actualTokenCount = currentTokenCount;

  // If within 10% of budget, consider it good enough
  const tolerance = section.tokenBudget * 0.1;
  if (currentTokenCount >= section.tokenBudget - tolerance &&
      currentTokenCount <= section.tokenBudget + tolerance) {
    log("Section content is within budget tolerance", {
      section: section.title,
      tokens: currentTokenCount,
      budget: section.tokenBudget
    });
    return section;
  }

  // If too short, expand content
  if (currentTokenCount < section.tokenBudget - tolerance) {
    const expandedContent = await expandContent(model, section, section.tokenBudget);
    section.content = expandedContent;
  }
  // If too long, truncate content
  else if (currentTokenCount > section.tokenBudget + tolerance) {
    const truncatedContent = await truncateContent(model, section, section.tokenBudget);
    section.content = truncatedContent;
  }

  // Update actual token count
  section.actualTokenCount = countSectionTokens(section);
  log("Section adjusted to meet token budget", {
    section: section.title,
    tokens: section.actualTokenCount,
    budget: section.tokenBudget
  });

  return section;
};
