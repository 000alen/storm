import { template } from "./template";
import { z } from "zod";

const outlineSchema = z.object({
  topic: z.string(),
});

const perspectivesSchema = z.object({
  topic: z.string(),
  n: z.number().int().positive(),
});

const questionsSchema = z.object({
  topic: z.string(),
  perspective: z.string(),
  n: z.number().int().positive(),
});

const answersSchema = z.object({
  topic: z.string(),
  questions: z.string(),
});

const finalOutlineSchema = z.object({
  topic: z.string(),
  draftOutline: z.string(),
  qAndA: z.string(),
});

const articleSectionSchema = z.object({
  topic: z.string(),
  outlineItem: z.string(),
  lastK: z.string(),
  similarContent: z.string().optional(),
});

export const outlinePromptTemplate = template(outlineSchema)`
You are an expert content strategist tasked with creating a comprehensive outline for an article.

TOPIC: ${params => params.topic}

Create a well-structured outline with the following elements:
1. A compelling title that accurately reflects the topic and will engage readers
2. A concise description summarizing what the article will cover
3. 3-5 main sections, each with:
   - A clear heading
   - A brief description of what this section will cover
   - 1-3 subsections where appropriate
   - A token budget for each section and subsection (number of tokens to allocate)

For token budgets:
- Assign a token budget to each section and subsection based on its importance and complexity
- Main sections typically need 500-1000 tokens
- Subsections typically need 200-500 tokens

The outline should have a logical flow, starting with introductory concepts and progressing to more complex ones.
Ensure the outline is comprehensive enough to create a complete article that provides real value to readers.
`;

export const perspectivesPromptTemplate = template(perspectivesSchema)`
Based on the article topic: ${params => params.topic}

Generate a list of diverse perspectives to enrich the article.

For each perspective, provide:
1. A title (e.g., "Historical Perspective", "Technical Viewpoint", "Ethical Considerations")
2. A brief description explaining this perspective's relevance to the topic
3. Guidelines on what aspects to explore from this perspective

Include ${params => params.n.toString()} distinct perspectives that will add depth and breadth to the article.
Focus on perspectives that might challenge the reader or offer unique insights.
Avoid overly similar perspectives or those with limited relevance to the main topic.
`;

export const questionsPromptTemplate = template(questionsSchema)`
Based on the following perspective regarding ${params => params.topic}:

${params => params.perspective}

Generate ${params => params.n.toString()} thought-provoking questions that will help explore this perspective deeply.

For each question:
1. Make it specific rather than general
2. Ensure it directly relates to the perspective
3. Frame it to elicit insightful and substantive answers
4. Avoid questions with simple yes/no answers

The questions should help uncover insights that would meaningfully contribute to the article.
`;

export const answersPromptTemplate = template(answersSchema)`
Based on the topic: ${params => params.topic}

Provide insightful, well-researched answers to the following questions:

${params => params.questions}

For each answer:
1. Provide substantive content (150-250 words per answer)
2. Include specific examples, data points, or evidence where relevant
3. Consider different angles or viewpoints within the answer
4. Conclude with an insight that could be incorporated into the article

Your answers should be authoritative, balanced, and directly usable in the article.
Avoid vague generalizations or unsubstantiated claims.
`;

export const finalOutlinePromptTemplate = template(finalOutlineSchema)`
Based on the topic: ${params => params.topic}

You are tasked with refining an article outline based on additional research and insights.

INITIAL DRAFT OUTLINE:
${params => params.draftOutline}

RESEARCH INSIGHTS (Q&A):
${params => params.qAndA}

Using the initial outline as a foundation and the Q&A insights as enrichment:
1. Create a more refined and comprehensive outline
2. Incorporate the most valuable insights from the Q&A
3. Restructure sections if needed to create better flow
4. Add or modify sections to address important aspects revealed in the research
5. Ensure the outline maintains focus on the core topic
6. Preserve or adjust the token budgets for each section as needed

For token budgets:
- Maintain the existing token budgets from the draft outline if they seem appropriate
- Adjust token budgets as needed based on your refinements (increase budgets for expanded sections, decrease for condensed ones)
- Allocate budgets proportionally based on section importance and complexity

The refined outline should be more nuanced and comprehensive than the initial draft,
while remaining cohesive and well-structured.
`;

export const articleSectionPromptTemplate = template(articleSectionSchema)`
Based on the topic: ${params => params.topic}

Your task is to continue writing the article, based on the following outline item:

"""
${params => params.outlineItem}
"""

The immediate previous sections are (not complete, just the immediate previous ones):

"""
${params => params.lastK}
"""

${params => params.similarContent ? `
IMPORTANT: Previous generation attempt produced content too similar to existing sections.
The following paragraphs were identified as semantically similar:

"""
${params.similarContent}
"""

Please generate more unique, in-depth content that avoids being too similar to these paragraphs.
` : ''}

Write this section to be:
1. Informative and substantive, with specific examples and evidence
2. Well-structured with clear paragraphs and transitions
3. Engaging and readable for the target audience
4. Connected to the overall article theme
5. The content should be original, accurate, and valuable to readers.
6. If this section has children/subsections, it should serve as an introduction to those topics.
7. Aim for a professional tone that matches the subject matter.
8. The article should be warm and engaging, with a tone that is friendly and approachable. Don't repeat yourself, be natural. Continue from where the previous section left off.
9. You may use markdown formatting, but don't use headings.

${params => {
  const outline = JSON.parse(params.outlineItem);
  if (outline.tokenBudget) {
    return `IMPORTANT: This section has a token budget of ${outline.tokenBudget} tokens. Please generate content that fits within this budget. A token is approximately 3/4 of a word.`;
  }
  return `Write approximately 300-500 words for this section, excluding any subsections.`;
}}
`;
