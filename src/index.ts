import { generateObject } from "ai";
import { z } from "zod";
import { log } from "@/logging";
import { openai } from "@ai-sdk/openai";
import { answerSchema, outlineSchema, perspectiveSchema, questionSchema, type ArticleSection, type Outline, type OutlineItem } from "@/types";

const model = openai("gpt-4o");

export async function generateArticleSection(
  outlineItem: OutlineItem,
): Promise<ArticleSection> {
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
    children = await Promise.all(outlineItem.children.map(generateArticleSection));
  }

  return {
    ...articleSection,
    children,
  };
}

export async function generateArticle(
  outline: Outline,
) {
  const articleSections = await Promise.all(outline.items.map(generateArticleSection));

  return {
    title: outline.title,
    description: outline.description,
    sections: articleSections,
  }
}

export async function storm(topic: string) {
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

  return await generateArticle(outline)
    .catch((error) => {
      log("Error generating article", { error });
      throw error;
    });
}
