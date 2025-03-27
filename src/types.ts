import type { EmbeddingModel, LanguageModel } from "ai";
import { z } from "zod";

export const textContentSchema = z.string().describe("Represents a bloc of content (could be thought of as a paragraph)");

export const baseOutlineItemSchema = z
  .object({
    title: z.string().describe("The title of the article section"),
    description: z.string().describe("The description of the article section"),
    guidelines: z.string().describe("The guidelines of the article section"),
    tokenBudget: z.number().int().positive().describe("The maximum number of tokens allowed for this section"),
  })
  .describe("The outline item of the article");

export type OutlineItem = z.infer<typeof baseOutlineItemSchema> & {
  items: OutlineItem[];
}

export const outlineItemSchema: z.ZodType<OutlineItem> = baseOutlineItemSchema
  .extend({
    items: z.lazy(() => outlineItemSchema.array().describe("The sub-sections of the article section")),
  });

export const outlineSchema = z
  .object({
    title: z.string().describe("The title of the article"),
    description: z.string().describe("The description of the article"),
    items: outlineItemSchema.array().describe("The outline of the article"),
  })
  .describe("The outline of the article");

export type Outline = z.infer<typeof outlineSchema>;

export const perspectiveSchema = z
  .object({
    title: z.string().describe("The title of the perspective"),
    description: z.string().describe("The description of the perspective"),
    guidelines: z.string().describe("The guidelines of the perspective"),
  })
  .describe("The perspective of the article");

export type Perspective = z.infer<typeof perspectiveSchema>;

export const questionSchema = z
  .object({
    objective: z.string().describe("The objective of the question"),
    question: z.string().describe("The question"),
  })
  .describe("A question to be answered by an expert");

export type Question = z.infer<typeof questionSchema>;

export const answerSchema = z
  .object({
    evidence: z.string().describe("The evidence for the answer"),
    answer: z.string().describe("The answer to the question"),
  })
  .describe("An answer to a question");

export type Answer = z.infer<typeof answerSchema>;

export type ArticleSection<TContent = string> = {
  title: string;
  description: string;
  content: TContent[];
  children: ArticleSection<TContent>[];
  tokenBudget: number;
  actualTokenCount: number;
}

export const articleSectionSchema: z.ZodType<ArticleSection> = z
  .object({
    title: z.string().describe("The title of the article section"),
    description: z.string().describe("The description of the article section"),
    // content: z.string().describe("The content of the article section"),
    content: textContentSchema.array().describe("The content of the article section"),
    children: z.lazy(() => z.array(articleSectionSchema as z.ZodType<ArticleSection>)).describe("The sub-sections of the article section"),
    tokenBudget: z.number().int().positive().describe("The maximum number of tokens allowed for this section"),
    actualTokenCount: z.number().int().positive().describe("The actual token count of this section"),
  })
  .describe("An article section");

export const articleSchema = z
  .object({
    title: z.string().describe("The title of the article"),
    description: z.string().describe("The description of the article"),
    sections: articleSectionSchema.array().describe("The sections of the article"),
  })
  .describe("The article");

export type Article = z.infer<typeof articleSchema>;


export interface StormOptions {
  model: LanguageModel;
  embeddingModel: EmbeddingModel<string>;

  topic: string;
  outline?: Outline;

  k?: number;
  dedupeThreshold?: number;
  maxAttempts?: number;
  maxSteps?: number;
  tokenTolerance?: number;

  // tools?: ToolSet;

  useResearchTools?: boolean;
}

export type GenerationState<TContent = string> = {
  topic: string;
  currentOutlineItem: OutlineItem;
  // lastKSections: ArticleSection<TContent>[];
  sections: ArticleSection<TContent>[];
  contents: TContent[];
  embeddings: any[];
}

/**
 * Type representing the result of a postprocessing step
 */
export interface PostprocessResult<TContent = string> {
  state: GenerationState<TContent>;
  content: TContent[];
}

/**
 * Type representing a postprocessing step function
 */
export type Postprocess<TContent = string> = (params: {
  options: StormOptions;
  state: GenerationState<TContent>;
  content: TContent[];
}) => Promise<PostprocessResult<TContent>>;
