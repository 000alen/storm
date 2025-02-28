import { createTemplate } from "./template";
import { z } from "zod";
import { stripIndent } from "common-tags";

// Define templates for prompts
export const outlinePromptTemplate = createTemplate(stripIndent`
You are an expert content strategist tasked with creating a comprehensive outline for an article.

TOPIC: {topic}

Create a well-structured outline with the following elements:
1. A compelling title that accurately reflects the topic and will engage readers
2. A concise description summarizing what the article will cover
3. 3-5 main sections, each with:
   - A clear heading
   - A brief description of what this section will cover
   - 1-3 subsections where appropriate

The outline should have a logical flow, starting with introductory concepts and progressing to more complex ones.
Ensure the outline is comprehensive enough to create a complete article that provides real value to readers.
`,
  z.object({
    topic: z.string(),
  })
);

export const perspectivesPromptTemplate = createTemplate(stripIndent`
Based on the article topic: {topic}

Generate a list of diverse perspectives to enrich the article.

For each perspective, provide:
1. A title (e.g., "Historical Perspective", "Technical Viewpoint", "Ethical Considerations")
2. A brief description explaining this perspective's relevance to the topic
3. Guidelines on what aspects to explore from this perspective

Include 3-5 distinct perspectives that will add depth and breadth to the article.
Focus on perspectives that might challenge the reader or offer unique insights.
Avoid overly similar perspectives or those with limited relevance to the main topic.
`, z.object({
  topic: z.string(),
}));

export const questionsPromptTemplate = createTemplate(stripIndent`
Based on the following perspective regarding {topic}:

{perspective}

Generate 3-5 thought-provoking questions that will help explore this perspective deeply.

For each question:
1. Make it specific rather than general
2. Ensure it directly relates to the perspective
3. Frame it to elicit insightful and substantive answers
4. Avoid questions with simple yes/no answers

The questions should help uncover insights that would meaningfully contribute to the article.
`, z.object({
  topic: z.string(),
  perspective: z.string(),
}));

export const answersPromptTemplate = createTemplate(stripIndent`
Based on the topic: {topic}

Provide insightful, well-researched answers to the following questions:

{questions}

For each answer:
1. Provide substantive content (150-250 words per answer)
2. Include specific examples, data points, or evidence where relevant
3. Consider different angles or viewpoints within the answer
4. Conclude with an insight that could be incorporated into the article

Your answers should be authoritative, balanced, and directly usable in the article.
Avoid vague generalizations or unsubstantiated claims.
`, z.object({
  topic: z.string(),
  questions: z.string(),
}));

export const finalOutlinePromptTemplate = createTemplate(stripIndent`
Based on the topic: {topic}

You are tasked with refining an article outline based on additional research and insights.

INITIAL DRAFT OUTLINE:
{draftOutline}

RESEARCH INSIGHTS (Q&A):
{qAndA}

Using the initial outline as a foundation and the Q&A insights as enrichment:
1. Create a more refined and comprehensive outline
2. Incorporate the most valuable insights from the Q&A
3. Restructure sections if needed to create better flow
4. Add or modify sections to address important aspects revealed in the research
5. Ensure the outline maintains focus on the core topic

The refined outline should be more nuanced and comprehensive than the initial draft,
while remaining cohesive and well-structured.
`, z.object({
  topic: z.string(),
  draftOutline: z.string(),
  qAndA: z.string(),
}));

export const articleSectionPromptTemplate = createTemplate(stripIndent`
Based on the topic: {topic}

Generate a high-quality article section based on the following outline item:

{outlineItem}

Write this section to be:
1. Informative and substantive, with specific examples and evidence
2. Well-structured with clear paragraphs and transitions
3. Engaging and readable for the target audience
4. Connected to the overall article theme

The content should be original, accurate, and valuable to readers.
If this section has children/subsections, it should serve as an introduction to those topics.
Aim for a professional tone that matches the subject matter.

Write approximately 300-500 words for this section, excluding any subsections.
`, z.object({
  topic: z.string(),
  outlineItem: z.string(),
}));
