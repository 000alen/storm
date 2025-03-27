import { type LanguageModel } from "ai";
import { type GenerationState, type PostprocessResult, type StormOptions } from "@/types";
import { estimateTokenCount } from "@/utils";
import { log } from "@/logging";
import { OpenAI } from "openai";

const openai = new OpenAI();

/**
 * Expands content to meet the token budget
 */
async function expandContent(
  model: LanguageModel,
  content: string,
  targetTokenCount: number
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: model.modelId,
    messages: [
      {
        role: "system",
        content: "You are an expert content expander. You will be given content that needs to be expanded to meet a token budget. Maintain the original tone and style while adding relevant details, examples, or elaborations."
      },
      {
        role: "user",
        content: `Expand the following content to approximately ${targetTokenCount} tokens while maintaining quality and relevance. Current content has approximately ${estimateTokenCount(content)} tokens.

Content:
${content}

Provide the expanded content as your response, with each paragraph on a separate line.`
      }
    ]
  }).catch(error => {
    log("Error expanding content", { error });
    throw error;
  });

  return response.choices[0]?.message.content?.trim() || content;
}

/**
 * Truncates content to meet the token budget
 */
async function truncateContent(
  model: LanguageModel,
  content: string,
  targetTokenCount: number
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: model.modelId,
    messages: [
      {
        role: "system",
        content: "You are an expert content editor. You will be given content that needs to be condensed to meet a token budget. Preserve the most important information while making the content more concise."
      },
      {
        role: "user",
        content: `Condense the following content to approximately ${targetTokenCount} tokens while preserving the key information. Current content has approximately ${estimateTokenCount(content)} tokens.

Content:
${content}

Provide the condensed content as your response, with each paragraph on a separate line.`
      }
    ]
  }).catch(error => {
    log("Error truncating content", { error });
    throw error;
  });

  return response.choices[0]?.message.content?.trim() || content;
}

/**
 * Ensures content meets its token budget requirements
 * Adjusts content if needed and calculates the actual token count
 */
export async function ensureBudget<TContent = string>({
  options,
  state,
  content,

  tokenBudget,
  skipAdjustment = false
}: {
  options: StormOptions;
  state: GenerationState<TContent>;
  content: TContent[];

  tokenBudget?: number;
  skipAdjustment?: boolean;
}): Promise<PostprocessResult<TContent>> {
  // If no token budget, just return content as is
  if (!tokenBudget) {
    return {
      state,
      content,
    };
  }

  const contentString = content.map(String).join("\n");
  const currentTokens = estimateTokenCount(contentString);

  // Log the adjustment process
  log("Adjusting content to meet token budget", {
    currentTokens,
    budget: tokenBudget
  });

  // Skip adjustment if requested (just count tokens)
  if (skipAdjustment) {
    log("Token count calculated (no adjustment)", {
      tokens: currentTokens,
      budget: tokenBudget
    });

    return {
      state,
      content,
    };
  }

  // If within 10% of budget, consider it good enough
  const tolerance = tokenBudget * 0.1;
  if (currentTokens >= tokenBudget - tolerance && currentTokens <= tokenBudget + tolerance) {
    log("Content is within budget tolerance", {
      tokens: currentTokens,
      budget: tokenBudget
    });
    return {
      state,
      content,
    };
  }

  // Adjust content based on token count
  const adjustContentPromise = currentTokens < tokenBudget - tolerance
    ? expandContent(options.model, contentString, tokenBudget)
      .then(adjustedContent => {
        log("Content expanded to meet budget", {
          originalTokens: currentTokens,
          newTokens: estimateTokenCount(adjustedContent),
          budget: tokenBudget
        });
        return adjustedContent;
      })
    : truncateContent(options.model, contentString, tokenBudget)
      .then(adjustedContent => {
        log("Content truncated to meet budget", {
          originalTokens: currentTokens,
          newTokens: estimateTokenCount(adjustedContent),
          budget: tokenBudget
        });
        return adjustedContent;
      });

  return adjustContentPromise
    .then(adjustedContent => {
      // Split adjusted content back into array and cast to original type
      const newContent = adjustedContent.split("\n").filter(Boolean) as unknown as TContent[];
      return {
        state,
        content: newContent,
      };
    })
    .catch(error => {
      log("Error adjusting content to meet token budget", { error });
      // On error, fall back to original content without adjusting
      return {
        state,
        content,
      };
    });
}
