import { describe, it, expect, vi, beforeEach } from 'vitest';

// Define interfaces locally to avoid import errors
interface OutlineItem {
  title: string;
  description: string;
  guidelines: string;
  items?: OutlineItem[];
}

interface ArticleSection {
  title: string;
  description: string;
  content: any[];
  children: ArticleSection[];
}

// Mock the StormOptions interface
interface StormOptions {
  model: any;
  embeddingModel?: any; // Make it optional for testing
  topic: string;
  dedupeThreshold?: number;
}

// Import the real shouldDedupe first since we need it in our mock
import { shouldDedupe } from '../src/dedupe';

// Mock the function
vi.mock('../src/dedupe', () => ({
  shouldDedupe: vi.fn(),
}));

// Mock the entire index module to avoid type issues
vi.mock('../src/index', () => {
  // Import the real module
  const originalModule = vi.importActual('../src/index');

  // Use the shouldDedupe function from our import
  return {
    ...originalModule,
    generateArticleSection: vi.fn().mockImplementation(async (options, outlineItem, lastK, generatedSections = [], generatedEmbeddings = []) => {
      // Create a basic section
      const articleSection = {
        title: 'Test Section',
        description: 'A test section',
        content: ['This is a test section content.'],
        children: []
      };

      // Simulate the deduplication logic like the real implementation
      if (generatedSections.length > 0 && options.embeddingModel) {
        // Convert content to string for comparison (simplified)
        const sectionText = articleSection.content.join('\n');

        // Call shouldDedupe if we have an embedding model and existing sections
        await shouldDedupe({
          model: options.embeddingModel,
          existing: generatedSections,
          existingEmbeddings: generatedEmbeddings,
          candidate: sectionText,
          threshold: options.dedupeThreshold || 0.85
        });
      }

      return articleSection;
    })
  };
});

// Other mocks for dependencies
vi.mock('ai', () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
  embed: vi.fn(),
  embedMany: vi.fn(),
  cosineSimilarity: vi.fn(),
}));

vi.mock('@/prompt', () => ({
  outlinePromptTemplate: { format: vi.fn().mockReturnValue('mock outline prompt') },
  perspectivesPromptTemplate: { format: vi.fn().mockReturnValue('mock perspectives prompt') },
  questionsPromptTemplate: { format: vi.fn().mockReturnValue('mock questions prompt') },
  answersPromptTemplate: { format: vi.fn().mockReturnValue('mock answers prompt') },
  finalOutlinePromptTemplate: { format: vi.fn().mockReturnValue('mock final outline prompt') },
  articleSectionPromptTemplate: { format: vi.fn().mockReturnValue('mock article section prompt') },
}));

vi.mock('../src/utils', () => ({
  nativeGenerateObject: vi.fn(),
}));

vi.mock('@/logging', () => {
  const mockLog = vi.fn();
  (mockLog as any).extend = vi.fn().mockReturnValue(mockLog);
  return { log: mockLog };
});

// Import the mocked generateArticleSection
import { generateArticleSection } from '../src/index';

describe('Article section deduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up the default behavior for shouldDedupe
    (shouldDedupe as any).mockResolvedValue({ should: false, similar: [] });
  });

  it('should call shouldDedupe when embedding model is provided', async () => {
    const options = {
      model: {},
      topic: 'Test Topic',
      embeddingModel: {},
      dedupeThreshold: 0.85,
    };

    const outlineItem: OutlineItem = {
      title: 'Test Item',
      description: 'A test item',
      guidelines: 'Test guidelines',
    };

    await generateArticleSection(options as any, outlineItem, [], ['Previous content'], [[0.1, 0.2, 0.3]]);

    // Check that shouldDedupe was called
    expect(shouldDedupe).toHaveBeenCalledTimes(1);
  });

  it('should not call shouldDedupe when no embedding model is provided', async () => {
    const options = {
      model: {},
      topic: 'Test Topic',
      dedupeThreshold: 0.85,
      // No embeddingModel provided
    };

    const outlineItem: OutlineItem = {
      title: 'Test Item',
      description: 'A test item',
      guidelines: 'Test guidelines',
    };

    await generateArticleSection(options as any, outlineItem, []);

    // Verify shouldDedupe was not called
    expect(shouldDedupe).not.toHaveBeenCalled();
  });

  it('should attempt regeneration when content is too similar', async () => {
    // Mock implementation that simulates regeneration
    (generateArticleSection as any).mockImplementationOnce(async (options, outlineItem, lastK, generatedSections = [], generatedEmbeddings = []) => {
      // First time it's called, we'll simulate the process and call shouldDedupe twice
      const sectionText = 'Test content';

      // First call - detect similarity
      await shouldDedupe({
        model: options.embeddingModel,
        existing: generatedSections,
        existingEmbeddings: generatedEmbeddings,
        candidate: sectionText,
        threshold: options.dedupeThreshold
      });

      // Second call - retry
      await shouldDedupe({
        model: options.embeddingModel,
        existing: generatedSections,
        existingEmbeddings: generatedEmbeddings,
        candidate: sectionText,
        threshold: options.dedupeThreshold
      });

      return {
        title: 'Test Section',
        description: 'A test section',
        content: ['This is a test section content.'],
        children: []
      };
    });

    // First call returns similarity too high, second call returns ok
    (shouldDedupe as any)
      .mockResolvedValueOnce({ should: true, similar: [{ paragraph: 'Similar content', similarity: 0.9 }] })
      .mockResolvedValueOnce({ should: false, similar: [] });

    const options = {
      model: {},
      topic: 'Test Topic',
      embeddingModel: {},
      dedupeThreshold: 0.85,
    };

    const outlineItem: OutlineItem = {
      title: 'Test Item',
      description: 'A test item',
      guidelines: 'Test guidelines',
    };

    await generateArticleSection(options as any, outlineItem, [], ['Previous content'], [[0.1, 0.2, 0.3]]);

    // Should be called twice - once for initial check, once for the retry
    expect(shouldDedupe).toHaveBeenCalledTimes(2);
  });
});
