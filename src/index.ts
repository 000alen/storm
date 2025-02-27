import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { log } from "@/logging";
import { answerSchema, outlineSchema, perspectiveSchema, questionSchema, type ArticleSection, type Outline, type OutlineItem } from "@/types";

export interface StormOptions {
  model: LanguageModel;
  topic: string;
}

export async function generateArticleSection(
  options: StormOptions,
  outlineItem: OutlineItem,
): Promise<ArticleSection> {
  const { model } = options;

  const {
    object: articleSection
  } = await generateObject({
    model,
    schema: z.object({
      title: z.string(),
      description: z.string(),
      content: z.string(),
    }),
    prompt: `Generate an article section for the outline item: ${outlineItem}.`,
  });

  let children: ArticleSection[] = [];
  if (outlineItem.children.length > 0) {
    children = await Promise.all(outlineItem.children.map((_) => generateArticleSection(options, _)));
  }

  return {
    ...articleSection,
    children,
  };
}

export async function generateArticle(
  options: StormOptions,
  outline: Outline,
) {
  const articleSections = await Promise.all(outline.items.map((_) => generateArticleSection(options, _)));

  return {
    title: outline.title,
    description: outline.description,
    sections: articleSections,
  }
}

export async function storm(options: StormOptions) {
  const { model, topic } = options;

  const { object: draftOutline } = await generateObject({
    model,
    schema: outlineSchema,
    prompt: `Generate an outline for an article about the topic of ${topic}.`,
  })
    .catch((error) => {
      log("Error generating outline", { error });
      throw error;
    });

  const { object: perspectives } = await generateObject({
    model,
    schema: perspectiveSchema.array(),
    prompt: "Generate a list of perspectives for the article outline.",
  })
    .catch((error) => {
      log("Error generating perspectives", { error });
      throw error;
    });

  const questions = await Promise
    .all(
      perspectives.map(async (perspective) => {
        const {
          object: questions
        } = await generateObject({
          model,
          schema: questionSchema.array(),
          prompt: `Generate a list of questions for the perspective: ${perspective}.`,
        });

        return { perspective, questions };
      })
    )
    .then((_) => _.flatMap((_) => _))
    .catch((error) => {
      log("Error generating questions", { error });
      throw error;
    });

  const answers = await Promise
    .all(questions.map(async ({ questions }) => {
      const {
        object: answers
      } = await generateObject({
        model,
        schema: answerSchema.array(),
        prompt: `Generate a list of answers for the question: ${questions}.`,
      });

      return answers;
    }))
    .catch((error) => {
      log("Error generating answers", { error });
      throw error;
    });

  const qAndA = questions.map(({ questions }, i) => questions.map((question, j) => ({
    question,
    answer: answers[i]![j],
  })));

  const { object: outline } = await generateObject({
    model,
    schema: outlineSchema,
    prompt: `Generate an outline for the article based on the draft outline: ${draftOutline} and Q&A: ${qAndA}.`,
  })
    .catch((error) => {
      log("Error generating outline", { error });
      throw error;
    });

  return await generateArticle(options, outline)
    .catch((error) => {
      log("Error generating article", { error });
      throw error;
    });
}
