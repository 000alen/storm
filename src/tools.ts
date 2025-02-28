import { log } from "./logging";
import { openai } from "@ai-sdk/openai";
import { generateText, tool, type ToolSet } from "ai";
import { z } from "zod";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { Stagehand } from "@browserbasehq/stagehand";

/**
 * A simple async queue to ensure operations run one at a time
 */
class AsyncQueue {
  private queue: Array<() => Promise<any>> = [];
  private isProcessing = false;

  /**
   * Add a task to the queue and process it when it's turn comes
   */
  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
          return result;
        } catch (error) {
          reject(error);
          throw error;
        }
      });

      // Start processing if not already doing so
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process queue items one at a time
   */
  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const task = this.queue.shift();
        if (task) {
          await task();
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

export async function createBBToolSet(): Promise<{ tools: ToolSet, stagehand: Stagehand }> {
  const stagehand = new Stagehand({
    env: "LOCAL",
    modelName: "gpt-4o"
  });

  await stagehand.init();

  // Create a shared queue for all tools
  const queue = new AsyncQueue();

  // const sessionTool = tool({
  //   description: 'Create a new Browserbase session. This is required to use the other tools. The session ID is returned and can be used in other tools.',
  //   parameters: z.object({}),
  //   execute: async () => {
  //     log("Creating a new Browserbase session");
  //     const session = await createBBSession();
  //     log("Created a new Browserbase session", { session: session });
  //     return { sessionId: session.id };
  //   },
  // })

  const searchTool = tool({
    description: 'Search Google for a query. Only one query can be passed at a time.',
    parameters: z.object({
      query: z.string().describe('The query to search Google for'),
    }),
    execute: async ({ query }) => {
      // Wrap the tool execution in the queue
      return queue.enqueue(async () => {
        log("Searching Google for a query", { query });

        // Get the default context and page
        // const defaultContext = browser.contexts()[0];
        // if (!defaultContext) {
        //   throw new Error("No default context found");
        // }

        await stagehand.page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
        await stagehand.page.waitForTimeout(500);
        await stagehand.page.keyboard.press('Enter');
        await stagehand.page.waitForLoadState('load', { timeout: 10000 });

        await stagehand.page.waitForSelector('.g');

        const results = await stagehand.page.evaluate(() => {
          const items = document.querySelectorAll('.g');
          return Array.from(items).map(item => {
            const title = item.querySelector('h3')?.textContent || '';
            const description = item.querySelector('.VwiC3b')?.textContent || '';
            return { title, description };
          });
        });

        const text = results.map(item => `${item.title}\n${item.description}`).join('\n\n');

        const response = await generateText({
          model: openai('gpt-4o'),
          prompt: `Evaluate the following web page content: ${text}`,
        });

        return {
          content: response.text,
        };
      });
    },
  });

  const getPageTool = tool({
    description: 'Get the content of a page using Playwright. Only one URL can be passed at a time.',
    parameters: z.object({
      url: z.string().describe('The URL of the page to fetch content from'),
    }),
    execute: async ({ url }) => {
      // Wrap the tool execution in the queue
      return queue.enqueue(async () => {
        log("Getting page content", { url });

        // Navigate to the specified URL
        await stagehand.page.goto(url, { waitUntil: 'networkidle' });

        // Get the page content
        const content = await stagehand.page.content();

        // Use Readability to extract the main content
        const dom = new JSDOM(content);
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        let extractedContent = '';
        if (article) {
          // If Readability successfully parsed the content, use it
          extractedContent = article.textContent;
        } else {
          // Fallback: extract all text from the body
          extractedContent = await stagehand.page.evaluate(() => document.body.innerText);
        }

        // Generate a summary using the Anthropic Claude model
        const response = await generateText({
          model: openai('gpt-4o'),
          prompt: `Summarize the following web page content: ${extractedContent}`,
        });

        // Return the structured response
        return {
          content: response.text,
        };
      });
    },
  });

  return {
    stagehand,
    tools: {
      searchTool,
      getPageTool,
    }
  };
}

