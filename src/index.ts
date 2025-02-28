import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { log } from "@/logging";
import { answerSchema, outlineSchema, perspectiveSchema, questionSchema, type ArticleSection, type Outline, type OutlineItem } from "@/types";
import {
  outlinePromptTemplate,
  perspectivesPromptTemplate,
  questionsPromptTemplate,
  answersPromptTemplate,
  finalOutlinePromptTemplate,
  articleSectionPromptTemplate
} from "./prompt";

export interface StormOptions {
  model: LanguageModel;
  topic: string;
}

export async function generateArticleSection(
  options: StormOptions,
  outlineItem: OutlineItem,
): Promise<ArticleSection> {
  const { model, topic } = options;

  log("Generating article section", { title: outlineItem.title });

  const {
    object: articleSection
  } = await generateObject({
    model,
    schema: z.object({
      title: z.string(),
      description: z.string(),
      content: z.string(),
    }),
    prompt: articleSectionPromptTemplate.format({ topic, outlineItem: JSON.stringify(outlineItem) }),
  });

  log("Article section generated", { title: articleSection.title });

  let children: ArticleSection[] = [];
  // if (outlineItem.children.length > 0) {
  //   children = await Promise.all(outlineItem.children.map((_) => generateArticleSection(options, _)));
  // }

  return {
    ...articleSection,
    children,
  };
}

export async function generateArticle(
  options: StormOptions,
  outline: Outline,
) {
  log("Starting article generation based on outline", { title: outline.title });

  const articleSections = await Promise.all(outline.items.map((_) => generateArticleSection(options, _)));

  log("Completed generating all article sections", { sectionCount: articleSections.length });

  return {
    title: outline.title,
    description: outline.description,
    sections: articleSections,
  }
}

export async function storm(options: StormOptions) {
  const { model, topic } = options;

  log("Starting storm process", { topic });

  const { object: draftOutline } = await generateObject({
    model,
    schema: outlineSchema,
    prompt: outlinePromptTemplate.format({ topic }),
  })
    .catch((error) => {
      log("Error generating outline", { error });
      throw error;
    });

  log("Draft outline generated", { title: draftOutline.title, sectionCount: draftOutline.items.length });

  const { object: { perspectives } } = await generateObject({
    model,
    schema: z.object({
      perspectives: perspectiveSchema.array(),
    }),
    prompt: perspectivesPromptTemplate.format({ topic }),
  })
    .catch((error) => {
      log("Error generating perspectives", { error });
      throw error;
    });

  log("Perspectives generated", { count: perspectives.length });

  const questions = await Promise
    .all(
      perspectives.map(async (perspective) => {
        log("Generating questions for perspective", { perspective: perspective.title });

        const {
          object: { questions }
        } = await generateObject({
          model,
          schema: z.object({
            questions: questionSchema.array(),
          }),
          prompt: questionsPromptTemplate.format({ topic, perspective: JSON.stringify(perspective) }),
        });

        log("Questions generated for perspective", { perspective: perspective.title, questionCount: questions.length });

        return { perspective, questions };
      })
    )
    .then((_) => _.flatMap((_) => _))
    .catch((error) => {
      log("Error generating questions", { error });
      throw error;
    });

  log("All questions generated", { totalPerspectives: perspectives.length });

  const answers = await Promise
    .all(questions.map(async ({ questions }, index) => {
      log("Generating answers for question set", { index, questionCount: questions.length });

      const {
        object: { answers }
      } = await generateObject({
        model,
        schema: z.object({
          answers: answerSchema.array(),
        }),
        prompt: answersPromptTemplate.format({ topic, questions: JSON.stringify(questions) }),
      });

      log("Answers generated for question set", { index, answerCount: answers.length });

      return answers;
    }))
    .catch((error) => {
      log("Error generating answers", { error });
      throw error;
    });

  log("All answers generated");

  const qAndA = questions.map(({ questions }, i) => questions.map((question, j) => ({
    question,
    answer: answers[i]![j],
  })));

  log("Q&A pairs created", { totalPairs: qAndA.flat().length });

  const { object: outline } = await generateObject({
    model,
    schema: outlineSchema,
    prompt: finalOutlinePromptTemplate.format({
      topic,
      draftOutline: JSON.stringify(draftOutline),
      qAndA: JSON.stringify(qAndA)
    }),
  })
    .catch((error) => {
      log("Error generating outline", { error });
      throw error;
    });

  log("Final outline generated", { title: outline.title, sectionCount: outline.items.length });

  const result = await generateArticle(options, outline)
    .catch((error) => {
      log("Error generating article", { error });
      throw error;
    });

  log("Article generation completed", { title: result.title });

  return result;
}
