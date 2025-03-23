import { generateObject, generateText, Output, type LanguageModel, type ToolSet } from "ai";
import { z } from "zod";
import { log } from "@/logging";
import { answerSchema, perspectiveSchema, questionSchema, textContentSchema, type Answer, type ArticleSection, type Outline, type OutlineItem } from "@/types";
import {
  outlinePromptTemplate,
  perspectivesPromptTemplate,
  questionsPromptTemplate,
  answersPromptTemplate,
  finalOutlinePromptTemplate,
  articleSectionPromptTemplate
} from "./prompt";
import { createBrowserToolSet } from "./tools";
import { type EmbeddingModel, embed } from "ai";
import outlineSchema from "./outlineSchema.json";
import { nativeGenerateObject, adjustContentToTokenBudget, countSectionTokens } from "./utils";
import { shouldDedupe } from "./dedupe";

export { getStream } from "@/components/article";
export { default as Article } from "@/components/article";

export interface StormOptions {
  model: LanguageModel;
  embeddingModel: EmbeddingModel<string>;

  topic: string;
  outline?: Outline;

  dedupeThreshold?: number;
  // tools?: ToolSet;


  useResearchTools?: boolean;
}

export async function generateArticleSection(
  options: StormOptions,
  outlineItem: OutlineItem,
  lastK: ArticleSection[],
  generatedSections: string[] = [],
  generatedEmbeddings: any[] = []
): Promise<ArticleSection> {
  const { model, topic, embeddingModel, dedupeThreshold = 0.85 } = options;

  log("Generating article section", { title: outlineItem.title });

  let articleSection;
  let maxAttempts = 3;
  let attempts = 0;
  let shouldRegenerate = false;

  do {
    attempts++;
    if (attempts > 1) {
      log(`Regenerating section (attempt ${attempts}) due to similarity`, { title: outlineItem.title });
    }

    const { object: generatedSection } = await generateObject({
      model,
      schema: z.object({
        title: z.string(),
        description: z.string(),
        content: textContentSchema.array(),
      }),
      prompt: articleSectionPromptTemplate.format({
        topic,
        outlineItem: JSON.stringify(outlineItem),
        lastK: JSON.stringify(lastK),
      }),
    });

    articleSection = {
      ...generatedSection,
      tokenBudget: outlineItem.tokenBudget,
      children: [],
      actualTokenCount: -1
    };

    // Convert section content to string for deduplication check
    const sectionText = articleSection.content.map(item =>
      typeof item === 'string' ? item : JSON.stringify(item)
    ).join('\n');

    if (generatedSections.length > 0 && embeddingModel) {
      // Check if this section is too similar to previously generated sections
      const { should } = await shouldDedupe({
        model: embeddingModel,
        existing: generatedSections,
        existingEmbeddings: generatedEmbeddings,
        candidate: sectionText,
        threshold: dedupeThreshold
      });

      shouldRegenerate = should && attempts < maxAttempts;

      if (should) {
        log("Section content is too similar to existing content", {
          title: outlineItem.title,
          attempt: attempts,
          willRegenerate: shouldRegenerate
        });
      }
    }

    if (!shouldRegenerate) {
      // Add this section's content to the list of generated sections
      generatedSections.push(sectionText);

      // Get embedding for this section if we have an embedding model
      if (embeddingModel) {
        const { embedding } = await embed({
          model: embeddingModel,
          value: sectionText
        });
        generatedEmbeddings.push(embedding);
      }
    }
  } while (shouldRegenerate);

  log("Article section generated", { title: articleSection.title, attempts });

  // Calculate and adjust token count if a budget is specified
  if (articleSection.tokenBudget) {
    log("Adjusting section content to meet token budget", {
      title: articleSection.title,
      budget: articleSection.tokenBudget
    });

    articleSection = await adjustContentToTokenBudget(model, articleSection);

    log("Section adjusted to meet token budget", {
      title: articleSection.title,
      tokens: articleSection.actualTokenCount,
      budget: articleSection.tokenBudget
    });
  } else {
    // Still calculate the token count for reporting
    articleSection.actualTokenCount = countSectionTokens(articleSection);
  }

  let children: ArticleSection[] = [];

  if (outlineItem.items && outlineItem.items.length > 0) {
    log("Processing subsections", { count: outlineItem.items.length, parentTitle: outlineItem.title });

    // Create a temporary version of the current section with empty children
    const currentSectionWithoutChildren = { ...articleSection, children: [] };

    // Process each subsection with true lastK that includes all previous subsections
    for (let i = 0; i < outlineItem.items.length; i++) {
      const subItem = outlineItem.items[i];

      // Skip any undefined items
      if (!subItem) continue;

      // For each subsection, include:
      // 1. The original lastK
      // 2. The parent section without children
      // 3. All previously generated subsections at this level
      const subsectionLastK = [
        ...lastK,
        currentSectionWithoutChildren,
        ...children
      ];

      const subsection = await generateArticleSection(
        options,
        subItem,
        subsectionLastK,
        generatedSections,
        generatedEmbeddings
      );
      children.push(subsection);
    }

    log("Completed generating subsections", {
      count: children.length,
      parentTitle: outlineItem.title
    });
  }

  return {
    ...articleSection,
    children,
  }
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
  let { model, topic, outline, useResearchTools = false } = options;

  log("Starting storm process", { topic });

  let draftOutline: Outline | null = null;
  if (!outline) {
    ({ object: draftOutline } = await nativeGenerateObject<Outline>({
      model,
      schema: outlineSchema,
      schemaName: "Outline",
      prompt: outlinePromptTemplate.format({ topic })
    })
      .catch((error) => {
        log("Error generating outline", { error });
        throw error;
      }));

    log("Draft outline generated", { title: draftOutline.title, sectionCount: draftOutline.items.length });
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

  let browserToolSet: { stagehand: any, tools: ToolSet } = {
    stagehand: undefined,
    tools: {},
  };

  if (useResearchTools) {
    browserToolSet = await createBrowserToolSet();
  }

  const answers: Answer[][] = await Promise.all(questions.map(async ({ questions }) => {
    const {
      experimental_output: { answers }
    } = await generateText({
      model,
      tools: browserToolSet.tools,
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

  if (browserToolSet.stagehand) {
    await browserToolSet.stagehand.close();
  }

  log("All answers generated");

  const qAndA = questions.map(({ questions }, i) => questions.map((question, j) => ({
    question,
    answer: answers[i]![j],
  })));

  log("Q&A pairs created", { totalPairs: qAndA.flat().length });

  if (!outline) {
    if (!draftOutline) {
      throw new Error("Outline generation failed");
    }

    const { object: refinedOutline } = await nativeGenerateObject<Outline>({
      model,
      schema: outlineSchema,
      schemaName: "Outline",
      prompt: finalOutlinePromptTemplate.format({
        topic,
        draftOutline: JSON.stringify(draftOutline),
        qAndA: JSON.stringify(qAndA)
      })
    })
      .catch((error) => {
        log("Error generating outline", { error });
        throw error;
      });

    log("Final outline generated", { title: refinedOutline.title, sectionCount: refinedOutline.items.length });

    outline = refinedOutline;
  }

  if (!outline) {
    throw new Error("Outline generation failed");
  }

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
