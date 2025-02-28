import { generateObject, generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { log } from "@/logging";
import { answerSchema, outlineSchema, perspectiveSchema, questionSchema, type Answer, type ArticleSection, type Outline, type OutlineItem } from "@/types";
import {
  outlinePromptTemplate,
  perspectivesPromptTemplate,
  questionsPromptTemplate,
  answersPromptTemplate,
  finalOutlinePromptTemplate,
  articleSectionPromptTemplate
} from "./prompt";
import { createBrowserToolSet } from "./tools";

export { getStream } from "@/components/article";
export { default as Article } from "@/components/article";

export interface StormOptions {
  model: LanguageModel;
  topic: string;
  // tools?: ToolSet;
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

  const { stagehand, tools } = await createBrowserToolSet();

  // const answers: Answer[][] = []
  // for (const { questions: _questions } of questions) {
  //   const {
  //     experimental_output: { answers: _answers }
  //   } = await generateText({
  //     model,
  //     tools,
  //     experimental_output: Output.object({
  //       schema: z.object({
  //         answers: answerSchema.array(),
  //       }),
  //     }),
  //     prompt: answersPromptTemplate.format({ topic, questions: JSON.stringify(_questions) }),
  //     maxSteps: 10,
  //   })
  //   log("Answers generated for question set", { answerCount: _answers.length });
  //   answers.push(_answers);
  // }
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
