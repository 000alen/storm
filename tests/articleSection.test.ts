import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Define interfaces locally to avoid import errors
interface OutlineItem {
  title: string;
  description: string;
  guidelines: string;
  tokenBudget?: number;
  items?: OutlineItem[];
}

interface ArticleSection {
  title: string;
  description: string;
  content: string[];
  children: ArticleSection[];
  tokenBudget?: number;
  actualTokenCount?: number;
}

// Mock the StormOptions interface
interface StormOptions {
  model: any;
  embeddingModel?: any;
  topic: string;
  dedupeThreshold?: number;
}

// Mock the utils module first
vi.mock('../src/utils', () => ({
  nativeGenerateObject: vi.fn(),
  adjustContentToTokenBudget: vi.fn().mockImplementation(async (model, section) => {
    // Simulate content adjustment based on token budget
    if (section.tokenBudget) {
      if (section.tokenBudget === 200) {
        return {
          ...section,
          content: ['Content adjusted to meet 200 token budget'],
          actualTokenCount: 200
        };
      } else if (section.tokenBudget === 500) {
        return {
          ...section,
          content: ['Content adjusted to meet 500 token budget'],
          actualTokenCount: 500
        };
      }
    }
    return {
      ...section,
      actualTokenCount: 100 // Default for tests
    };
  }),
  countSectionTokens: vi.fn().mockReturnValue(100)
}));

// Mock the shouldDedupe function
vi.mock('../src/dedupe', () => ({
  shouldDedupe: vi.fn().mockResolvedValue({ should: false, similar: [] })
}));

// Mock the ai module
vi.mock('ai', () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: {
      title: 'Generated Title',
      description: 'Generated Description',
      content: ['Generated content paragraph 1', 'Generated content paragraph 2'],
    }
  }),
  generateText: vi.fn(),
  embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] }),
}));

// Mock the logging module
vi.mock('@/logging', () => ({
  log: vi.fn()
}));

// Mock the prompt module
vi.mock('../src/prompt', () => ({
  articleSectionPromptTemplate: {
    format: vi.fn().mockReturnValue('mocked article section prompt')
  }
}));

// Import the generateArticleSection function after mocks
import { generateArticleSection } from '../src/index';
import { adjustContentToTokenBudget } from '../src/utils';

describe('Article section token budget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass the token budget from outline item to article section', async () => {
    const options: StormOptions = {
      model: { modelId: 'test-model' },
      topic: 'Test Topic',
    };

    const outlineItem: OutlineItem = {
      title: 'Test Section',
      description: 'Test section description',
      guidelines: 'Test guidelines',
      tokenBudget: 200,
      items: []
    };

    const result = await generateArticleSection(options, outlineItem, []);

    // Check if token budget was passed correctly
    expect(result.tokenBudget).toBe(200);

    // Check if adjustContentToTokenBudget was called
    expect(adjustContentToTokenBudget).toHaveBeenCalled();

    // Verify the content was adjusted to meet the token budget
    expect(result.content).toContain('Content adjusted to meet 200 token budget');
    expect(result.actualTokenCount).toBe(200);
  });

  it('should apply token budgets to subsections as well', async () => {
    const options: StormOptions = {
      model: { modelId: 'test-model' },
      topic: 'Test Topic',
    };

    const outlineItem: OutlineItem = {
      title: 'Parent Section',
      description: 'Parent section description',
      guidelines: 'Parent guidelines',
      tokenBudget: 500,
      items: [
        {
          title: 'Child Section',
          description: 'Child section description',
          guidelines: 'Child guidelines',
          tokenBudget: 200,
          items: []
        }
      ]
    };

    const result = await generateArticleSection(options, outlineItem, []);

    // Check parent section
    expect(result.tokenBudget).toBe(500);
    expect(result.content).toContain('Content adjusted to meet 500 token budget');
    expect(result.actualTokenCount).toBe(500);

    // Check child section
    expect(result.children.length).toBe(1);
    expect(result.children[0].tokenBudget).toBe(200);
    expect(result.children[0].content).toContain('Content adjusted to meet 200 token budget');
    expect(result.children[0].actualTokenCount).toBe(200);
  });

  it('should still calculate token count even without a budget', async () => {
    const options: StormOptions = {
      model: { modelId: 'test-model' },
      topic: 'Test Topic',
    };

    const outlineItem: OutlineItem = {
      title: 'No Budget Section',
      description: 'Section without token budget',
      guidelines: 'Test guidelines',
      items: []
    };

    const result = await generateArticleSection(options, outlineItem, []);

    // Should still have calculated the token count
    expect(result.tokenBudget).toBeUndefined();
    expect(result.actualTokenCount).toBeDefined();

    // Check that the content wasn't adjusted
    expect(result.content).toEqual(['Generated content paragraph 1', 'Generated content paragraph 2']);
  });
});
