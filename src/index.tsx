import { generateObject, generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { log } from "@/logging";
import { answerSchema, perspectiveSchema, questionSchema, type Answer, type ArticleSection, type Outline, type OutlineItem } from "@/types";
import {
  outlinePromptTemplate,
  perspectivesPromptTemplate,
  questionsPromptTemplate,
  answersPromptTemplate,
  finalOutlinePromptTemplate,
  articleSectionPromptTemplate
} from "./prompt";
import { createBrowserToolSet } from "./tools";
import { type EmbeddingModel } from "ai";
import outlineSchema from "./outlineSchema.json";
import { nativeGenerateObject } from "./utils";

export { getStream } from "@/components/article";
export { default as Article } from "@/components/article";

export interface StormOptions {
  model: LanguageModel;
  embeddingModel: EmbeddingModel<string>;

  topic: string;
  outline?: Outline;

  dedupeThreshold?: number;
  // tools?: ToolSet;
}

export async function generateArticleSection(
  options: StormOptions,
  outlineItem: OutlineItem,
  lastK: ArticleSection[]
): Promise<ArticleSection> {
  const { model, topic } = options;

  log("Generating article section", { title: outlineItem.title });

  let articleSection;

  const { object: generatedSection } = await generateObject({
    model,
    schema: z.object({
      title: z.string(),
      description: z.string(),
      content: z.string(),
    }),
    prompt: articleSectionPromptTemplate.format({
      topic,
      outlineItem: JSON.stringify(outlineItem),
      lastK: JSON.stringify(lastK),
    }),
  });

  articleSection = generatedSection;

  log("Article section generated", { title: articleSection.title });

  let children: ArticleSection[] = [];

  if (outlineItem.subItems && outlineItem.subItems.length > 0) {
    log("Processing subsections", { count: outlineItem.subItems.length, parentTitle: outlineItem.title });

    children = await Promise.all(
      outlineItem.subItems!.map(subItem =>
        generateArticleSection(options, subItem, [
          ...lastK,
          { ...articleSection, children: [] }
        ])
      )
    );

    log("Completed generating subsections", {
      count: children.length,
      parentTitle: outlineItem.title
    });
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
  log("Starting article generation based on outline", { title: outline.title });

  const k = 1;

  const articleSections: ArticleSection[] = [];
  for (const item of outline.items) {
    const lastK = articleSections.slice(-k);
    log(`Generating main section and any subsections for "${item.title}"`);
    const articleSection = await generateArticleSection(options, item, lastK);
    articleSections.push(articleSection);

    // Log information about the generated section and its subsections
    const subsectionCount = articleSection.children.length;
    log(`Completed section "${item.title}" with ${subsectionCount} subsections`);
  }

  const totalSections = articleSections.length;
  const totalSubsections = articleSections.reduce(
    (count, section) => count + section.children.length,
    0
  );

  log("Completed generating all article sections", {
    mainSectionCount: totalSections,
    subsectionCount: totalSubsections,
    totalSectionCount: totalSections + totalSubsections
  });

  return {
    title: outline.title,
    description: outline.description,
    sections: articleSections,
  }
}

export async function storm(options: StormOptions) {
  let { model, topic, outline } = options;

  log("Starting storm process", { topic });

  if (!outline) {
    const { object: draftOutline } = await nativeGenerateObject<Outline>({
      model,
      schema: outlineSchema,
      schemaName: "Outline",
      prompt: outlinePromptTemplate.format({ topic })
    })
      .catch((error) => {
        log("Error generating outline", { error });
        throw error;
      });

    log("Draft outline generated", { title: draftOutline.title, sectionCount: draftOutline.items.length });

    outline = draftOutline;
  } else {
    log("Outline provided", { title: outline.title, sectionCount: outline.items.length });
  }

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

  const { stagehand, tools } = await createBrowserToolSet();

  const answers: Answer[][] = await Promise.all(questions.map(async ({ questions }) => {
    const {
      experimental_output: { answers }
    } = await generateText({
      model,
      tools,
      experimental_output: Output.object({
        schema: z.object({
          answers: answerSchema.array(),
        }),
      }),
      prompt: answersPromptTemplate.format({ topic, questions: JSON.stringify(questions) }),
      maxSteps: 10,
    })
      .catch((error) => {
        log("Error generating answers", { error });
        throw error;
      });

    log("Answers generated for question set", { answerCount: answers.length });

    return answers;
  }));

  await stagehand.close();

  log("All answers generated");

  const qAndA = questions.map(({ questions }, i) => questions.map((question, j) => ({
    question,
    answer: answers[i]![j],
  })));

  log("Q&A pairs created", { totalPairs: qAndA.flat().length });

  const { object: refinedOutline } = await nativeGenerateObject<Outline>({
    model,
    schema: outlineSchema,
    schemaName: "Outline",
    prompt: finalOutlinePromptTemplate.format({
      topic,
      draftOutline: JSON.stringify(outline),
      qAndA: JSON.stringify(qAndA)
    })
  })
    .catch((error) => {
      log("Error generating outline", { error });
      throw error;
    });

  outline = refinedOutline;

  log("Final outline generated", { title: outline.title, sectionCount: outline.items.length });

  const article = await generateArticle(options, outline)
    .catch((error) => {
      log("Error generating article", { error });
      throw error;
    });

  log("Article generation completed", { title: article.title });

  return {
    article,
    outline,
    perspectives,
    questions,
    answers,
    qAndA,
  }
}
