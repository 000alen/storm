import { generateObject, generateText, Output, type ToolSet } from "ai";
import { z } from "zod";
import { log } from "@/logging";
import { answerSchema, perspectiveSchema, questionSchema, textContentSchema, type Answer, type ArticleSection, type GenerationState, type Outline, type OutlineItem, type Postprocess, type StormOptions } from "@/types";
import {
  outlinePromptTemplate,
  perspectivesPromptTemplate,
  questionsPromptTemplate,
  answersPromptTemplate,
  finalOutlinePromptTemplate,
  articleSectionPromptTemplate
} from "@/prompt";
import { createBrowserToolSet } from "@/tools";
import outlineSchema from "@/outlineSchema.json";
import { nativeGenerateObject } from "@/utils";
import { ensureBudget } from "@/postprocessing/budget";
import { ensureUnique } from "@/postprocessing/unique";
import { DEFAULT_K, DEFAULT_MAX_STEPS, DEFAULT_PERSPECTIVES_N, DEFAULT_QUESTIONS_N, DEFAULT_TOKEN_BUDGET, DEFAULT_USE_RESEARCH_TOOLS } from "@/config";

export { getStream } from "@/components/article";
export { default as Article } from "@/components/article";

const postprocessing: Postprocess[] = [
  ensureUnique,
  ensureBudget,
];

export async function generateArticleSection(
  options: StormOptions,
  state: GenerationState,
  outlineItem: OutlineItem,
  generatedSections: string[] = [],
  generatedEmbeddings: any[] = []
): Promise<{ articleSection: ArticleSection, state: GenerationState }> {
  const k = options.k ?? DEFAULT_K;
  const contentSchema = options.contentSchema ?? textContentSchema;

  log("Generating article section", { title: outlineItem.title });

  // Generate the initial section content
  const { object: generatedSection } = await generateObject({
    model: options.model,
    schema: z.object({
      title: z.string(),
      description: z.string(),
      content: contentSchema.array(),
    }),
    prompt: articleSectionPromptTemplate.format({
      topic: options.topic,
      outlineItem: JSON.stringify(outlineItem),
      lastK: JSON.stringify(state.sections.slice(-k)),
    }),
  })
    .catch((error) => {
      log("Error generating article section", { title: outlineItem.title, error });
      throw error;
    });

  let articleSection: ArticleSection = {
    ...generatedSection,
    tokenBudget: outlineItem.tokenBudget,
    children: [],
    actualTokenCount: -1
  };

  // Update state with current outline item and lastK sections
  state = {
    ...state,
    currentOutlineItem: outlineItem,
  };

  // Apply postprocessing steps in sequence
  for (const step of postprocessing) {
    const result = await step({ options, state, content: articleSection.content });

    state = result.state;
    articleSection.content = result.content;
  }

  log("Article section generated", { title: articleSection.title });

  let children: ArticleSection[] = [];

  if (outlineItem.items && outlineItem.items.length > 0) {
    log("Processing subsections", { count: outlineItem.items.length, parentTitle: outlineItem.title });

    // Create a temporary version of the current section with empty children
    const currentSectionWithoutChildren = { ...articleSection, children: [] };

    // Add this temporary section to state for subsections to access
    const subsectionState: GenerationState = {
      ...state,
      sections: [...state.sections, currentSectionWithoutChildren]
    };

    // Process each subsection with true lastK that includes all previous subsections
    for (let i = 0; i < outlineItem.items.length; i++) {
      const subItem = outlineItem.items[i];

      // Skip any undefined items
      if (!subItem) continue;

      // Create state for this subsection - include previously generated children
      const currentSubsectionState: GenerationState = {
        ...subsectionState,
        sections: [
          ...subsectionState.sections,
          ...children
        ]
      };

      const { articleSection: subsection, state: updatedState } = await generateArticleSection(
        options,
        currentSubsectionState,
        subItem,
        generatedSections,
        generatedEmbeddings
      );

      // Update the state with the one returned from the subsection generation
      state = {
        ...updatedState,
        // Preserve the correct allGeneratedSections for this level
        sections: state.sections
      };

      children.push(subsection);
    }

    log("Completed generating subsections", {
      count: children.length,
      parentTitle: outlineItem.title
    });
  }

  // Create the final articleSection with children
  const finalArticleSection = {
    ...articleSection,
    children,
  };

  // Add the complete section to allGeneratedSections
  state = {
    ...state,
    sections: [...state.sections, finalArticleSection]
  };

  return {
    articleSection: finalArticleSection,
    state
  };
}

export async function generateArticle(
  options: StormOptions,
  outline: Outline,
) {
  log("Starting article generation based on outline", { title: outline.title });

  // Initialize generation state with a placeholder outline item
  const initialOutlineItem: OutlineItem = {
    title: outline.title,
    description: outline.description,
    guidelines: "",
    tokenBudget: DEFAULT_TOKEN_BUDGET,
    items: []
  };

  let state: GenerationState = {
    topic: options.topic,
    currentOutlineItem: initialOutlineItem,
    sections: [],
    contents: [],
    embeddings: [],
  };

  const articleSections: ArticleSection[] = [];
  for (const item of outline.items) {
    log(`Generating main section and any subsections for "${item.title}"`);

    const { articleSection, state: updatedState } = await generateArticleSection(
      options,
      state,
      item,
    );

    // Update the state with the one returned from the section generation
    state = updatedState;

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
  let { model, topic, outline, useResearchTools = DEFAULT_USE_RESEARCH_TOOLS, perspectives: nPerspectives = DEFAULT_PERSPECTIVES_N, questions: nQuestions = DEFAULT_QUESTIONS_N } = options;

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
    prompt: perspectivesPromptTemplate.format({ topic, n: nPerspectives }),
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
          prompt: questionsPromptTemplate.format({ topic, perspective: JSON.stringify(perspective), n: nQuestions }),
        })
          .catch((error) => {
            log("Error generating questions for perspective", { perspective: perspective.title, error });
            throw error;
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
      maxSteps: options.maxSteps ?? DEFAULT_MAX_STEPS,
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
