import { z } from "zod";

export type OutlineItem = {
  title: string;
  description: string;
  guidelines: string;
  // children: OutlineItem[];
};

export const outlineItemSchema: z.ZodType<OutlineItem> = z
  .object({
    title: z.string().describe("The title of the article section"),
    description: z.string().describe("The description of the article section"),
    guidelines: z.string().describe("The guidelines of the article section"),
    // children: z.lazy(() => outlineItemSchema.array()).describe("The sub-sections of the article section"),
  })
  .describe("The outline item of the article");

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

export type ArticleSection = {
  title: string;
  description: string;
  content: string;
  children: ArticleSection[];
}

export const articleSectionSchema: z.ZodType<ArticleSection> = z
  .object({
    title: z.string().describe("The title of the article section"),
    description: z.string().describe("The description of the article section"),
    content: z.string().describe("The content of the article section"),
    children: z.lazy(() => articleSectionSchema.array()).describe("The sub-sections of the article section"),
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
