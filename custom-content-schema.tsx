import "dotenv/config";

import React from "react";

import fs from "fs";
import { storm } from "./src";
import { log } from "./src/logging";
import { Article } from "./src/types";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { Document, Page, Text, View, StyleSheet, renderToStream } from '@react-pdf/renderer';
import outline from "./private/outline.json";

const contentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("image").describe("Use this type to include images in the content"),
    caption: z.string().describe("The caption for the image"),
  }),
  z.object({
    type: z.literal("text").describe("Use this type to include text in the content"),
    text: z.string().describe("The text content (paragraph)"),
  }),
  z.object({
    type: z.literal("insight").describe("Use this type to highlight important insights"),
    title: z.string().describe("The title of the insight"),
    content: z.string().describe("The insight content"),
  })
])

type Content = z.infer<typeof contentSchema>;

type CustomArticle = Article<Content>;

/**
 * Convert an Article object to HTML
 * @param article The article to convert
 * @returns HTML string representation of the article
 */
export function toHTML(article: CustomArticle): string {
  try {
    let html = `<div class="article">
      <h1>${article.title}</h1>
      <div class="article-description">${article.description}</div>
      ${article.sections.map(section => renderSection(section)).join('')}
    </div>`;

    return html;
  } catch (error) {
    log("error", "Error converting article to HTML", error);
    throw error;
  }
}

/**
 * Render a section of the article to HTML
 * @param section The section to render
 * @returns HTML string representation of the section
 */
function renderSection(section: CustomArticle['sections'][0]): string {
  return `
    <section class="article-section">
      <table class="section-title-wrapper">
        <tr>
          <td class="icon icon-heading"></td>
          <td class="h2-text-container">
            <h2>${section.title}</h2>
          </td>
        </tr>
      </table>

      ${section.content.map(content => renderContent(content)).join('')}

      ${section.children.map(child => renderSection(child)).join('')}
    </section>
  `;
}

/**
 * Render a content item to HTML
 * @param content The content item to render
 * @returns HTML string representation of the content
 */
function renderContent(content: Content): string {
  if (content.type === "text") {
    // Process text content for bold tags, etc.
    let processedText = content.text
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')  // Bold text in **bold**
      .replace(/\*(.*?)\*/g, '<em>$1</em>');   // Italic text in *italic*

    // Handle bullet lists - text that starts with "- " on each line
    if (processedText.includes('\n- ') || processedText.startsWith('- ')) {
      // Split the text into lines
      const lines = processedText.split('\n');
      const listItems: string[] = [];
      const paragraphs: string[] = [];

      let inList = false;

      for (const line of lines) {
        if (line.startsWith('- ')) {
          if (!inList) {
            // If we have paragraphs content, add it before starting the list
            if (paragraphs.length > 0) {
              processedText = `<p>${paragraphs.join('</p><p>')}</p>`;
              paragraphs.length = 0;
            } else {
              processedText = '';
            }
            inList = true;
          }
          listItems.push(line.substring(2)); // Remove the "- " prefix
        } else {
          if (inList) {
            // End the current list
            processedText += `<ul>\n${listItems.map(item => `    <li>${item}</li>`).join('\n')}\n</ul>`;
            listItems.length = 0;
            inList = false;
          }

          if (line.trim()) {
            paragraphs.push(line);
          }
        }
      }

      // Handle any remaining list items
      if (inList && listItems.length > 0) {
        processedText += `<ul>\n${listItems.map(item => `    <li>${item}</li>`).join('\n')}\n</ul>`;
      }

      // Handle any remaining paragraphs
      if (paragraphs.length > 0) {
        if (processedText) {
          processedText += `<p>${paragraphs.join('</p><p>')}</p>`;
        } else {
          processedText = `<p>${paragraphs.join('</p><p>')}</p>`;
        }
      }

      return processedText;
    }

    return `<p>${processedText}</p>`;
  }

  if (content.type === "image") {
    return `
      <figure class="image-container">
        <img src="placeholder.jpg" alt="${content.caption}" />
        <figcaption>${content.caption}</figcaption>
      </figure>
    `;
  }

  if (content.type === "insight") {
    return `
      <div class="insight-box">
        <h3 class="insight-title">${content.title}</h3>
        <div class="insight-content">${content.content}</div>
      </div>
    `;
  }

  return '';
}

// Create styles for the PDF document
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 40,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
    color: '#2c3e50',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    color: '#7f8c8d',
    marginBottom: 30,
  },
  divider: {
    borderBottom: '1 solid #ecf0f1',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
    marginTop: 10,
    color: '#2c3e50',
    paddingBottom: 8,
    borderBottom: '2 solid #3498db',
  },
  text: {
    fontSize: 12,
    marginBottom: 16,
    lineHeight: 1.6,
    color: '#2c3e50',
    textAlign: 'justify',
  },
  imageContainer: {
    marginVertical: 20,
    alignItems: 'center',
  },
  imagePlaceholder: {
    width: 350,
    height: 200,
    backgroundColor: '#ecf0f1',
    marginBottom: 8,
    borderRadius: 8,
    border: '1 solid #bdc3c7',
  },
  imageCaption: {
    fontSize: 10,
    fontStyle: 'italic',
    textAlign: 'center',
    color: '#7f8c8d',
    paddingHorizontal: 20,
  },
  insightContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    marginVertical: 18,
    borderLeft: '4 solid #3498db',
    marginHorizontal: 5,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#3498db',
  },
  insightContent: {
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 1.6,
    color: '#34495e',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 10,
    color: '#95a5a6',
  },
  pageNumber: {
    position: 'absolute',
    bottom: 30,
    right: 40,
    fontSize: 10,
    color: '#95a5a6',
  }
});

const ArticleComponent = ({ article }: { article: CustomArticle }) => {
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <Document>
      {/* Cover Page */}
      <Page size="A4" style={styles.page}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={[styles.title, { fontSize: 32, marginBottom: 20 }]}>{article.title}</Text>
          <View style={{ backgroundColor: '#3498db', height: 4, width: 100, marginBottom: 20 }} />
          <Text style={styles.subtitle}>A comprehensive report on emerging treatments and innovations</Text>
          <Text style={[styles.subtitle, { marginTop: 50 }]}>{currentDate}</Text>
        </View>
        <Text style={styles.footer}>Generated with Storm</Text>
      </Page>

      {/* Table of Contents */}
      <Page size="A4" style={styles.page}>
        <Text style={[styles.sectionTitle, { borderBottom: 'none', marginBottom: 20 }]}>Contents</Text>
        <View style={styles.divider} />

        {article.sections.map((section, index) => (
          <View key={`toc-${index}`} style={{ flexDirection: 'row', marginBottom: 15 }}>
            <Text style={{ fontSize: 12, color: '#3498db', fontWeight: 'bold', marginRight: 10 }}>{index + 1}.</Text>
            <Text style={{ fontSize: 12, flex: 1, color: '#2c3e50' }}>{section.title}</Text>
          </View>
        ))}

        <Text style={styles.pageNumber}>i</Text>
      </Page>

      {/* Content Pages */}
      {article.sections.map((section, sectionIndex) => (
        <Page key={`section-${sectionIndex}`} size="A4" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>

          <View>
            {section.content.map((content, contentIndex) => {
              if (content.type === "image") {
                return (
                  <View key={`image-${contentIndex}`} style={styles.imageContainer}>
                    <View style={styles.imagePlaceholder} />
                    <Text style={styles.imageCaption}>{content.caption}</Text>
                  </View>
                );
              } else if (content.type === "insight") {
                return (
                  <View key={`insight-${contentIndex}`} style={styles.insightContainer}>
                    <Text style={styles.insightTitle}>{content.title}</Text>
                    <Text style={styles.insightContent}>{content.content}</Text>
                  </View>
                );
              } else {
                return (
                  <Text key={`text-${contentIndex}`} style={styles.text}>
                    {content.text}
                  </Text>
                );
              }
            })}
          </View>

          <Text style={styles.pageNumber}>{sectionIndex + 2}</Text>
        </Page>
      ))}
    </Document>
  );
};

async function main() {
  // const gpt4o = openai("gpt-4o");
  const sonnet = anthropic("claude-3-5-sonnet-20240620");

  const embeddingModel = openai.embedding("text-embedding-3-small");

  const result = await storm({
    // model: gpt4o,
    model: sonnet,
    embeddingModel,
    topic: "Beyond CPAP: New Hope for Sleep Apnea. Include images (type=\"image\") and insights (type=\"insight\") in the content.",
    outline,
    useResearchTools: false,
    k: 1,
    contentSchema
  })
    .catch((error) => {
      log("error", error);
      throw error;
    });

  await fs.promises.writeFile("result.json", JSON.stringify(result, null, 2));

  // Generate PDF
  const stream = await renderToStream(<ArticleComponent article={result.article} />);
  await fs.promises.writeFile("result.pdf", stream);

  // Generate HTML
  try {
    const htmlContent = toHTML(result.article);
    await fs.promises.writeFile("result.html", htmlContent);
    log("info", "HTML file generated successfully");
  } catch (error) {
    log("error", "Failed to generate HTML", error);
  }
}

main()
  .catch((error) => {
    log("fatal error", error);

    process.exit(1);
  });
