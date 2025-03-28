import { log } from "./logging";
import { openai } from "@ai-sdk/openai";
import { generateText, tool, type ToolSet } from "ai";
import { z } from "zod";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { Stagehand } from "@browserbasehq/stagehand";
import { type Page } from "playwright";

export async function createBrowserToolSet(): Promise<{ tools: ToolSet, stagehand: Stagehand }> {
  const stagehand = new Stagehand({
    env: "LOCAL",
    modelName: "gpt-4o",
    // localBrowserLaunchOptions: {
    //   headless: true,
    // }
  });

  await stagehand.init();

  const searchTool = tool({
    description: 'Search Google for a query. Only one query can be passed at a time.',
    parameters: z.object({
      query: z.string().describe('The query to search Google for'),
    }),
    execute: async ({ query }) => {
      log("Searching Google for a query", { query });

      let page: Page | null = null;

      try {
        page = await stagehand.context.newPage();

        await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');
        await page.waitForLoadState('load', { timeout: 10000 });

        await page.waitForSelector('.g');

        const results = await page.evaluate(() => {
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
      } catch (error) {
        log("Error in searchTool", { query, error: error instanceof Error ? error.message : String(error) });

        return {
          content: `I encountered an error while trying to search for "${query}". ${error instanceof Error ? error.message : 'Please try again or try with a different query.'}`,
        };
      } finally {
        if (page) await page.close();
      }
    },
  });

  const getPageTool = tool({
    description: 'Get the content of a page using Playwright. Only one URL can be passed at a time.',
    parameters: z.object({
      url: z.string().describe('The URL of the page to fetch content from'),
    }),
    execute: async ({ url }) => {
      log("Getting page content", { url });

      let page: Page | null = null;

      try {
        page = await stagehand.context.newPage();

        // Navigate to the specified URL
        await page.goto(url, { waitUntil: 'networkidle' });

        // Get the page content
        const content = await page.content();

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
          extractedContent = await page.evaluate(() => document.body.innerText);
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
      } catch (error) {
        // Log the error
        log("Error in getPageTool", { url, error: error instanceof Error ? error.message : String(error) });

        // Return a fallback response
        return {
          content: `I encountered an error while trying to fetch content from "${url}". ${error instanceof Error ? error.message : 'Please try again or check if the URL is correct and accessible.'}`,
        };
      } finally {
        if (page) await page.close();
      }
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

