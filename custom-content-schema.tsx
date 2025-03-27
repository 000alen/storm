import "dotenv/config";

import React from "react";

import fs from "fs";
import { storm } from "./src";
import { log } from "./src/logging";
import { Article } from "./src/types";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { Document, Page, Text, View, StyleSheet, renderToStream } from '@react-pdf/renderer';

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

// Create styles for the PDF document
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    marginTop: 10,
  },
  text: {
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 1.5,
  },
  imageContainer: {
    marginVertical: 15,
    alignItems: 'center',
  },
  imagePlaceholder: {
    width: 300,
    height: 200,
    backgroundColor: '#e0e0e0',
    marginBottom: 5,
    borderRadius: 5,
  },
  imageCaption: {
    fontSize: 10,
    fontStyle: 'italic',
    textAlign: 'center',
    color: '#666',
  },
  insightContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 15,
    marginVertical: 15,
    borderLeft: '4 solid #3498db',
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#3498db',
  },
  insightContent: {
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 1.5,
  }
});

const ArticleComponent = ({ article }: { article: CustomArticle }) => {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{article.title}</Text>
      </Page>

      {article.sections.map((section, sectionIndex) => (
        <Page key={`section-${sectionIndex}`} size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>{section.title}</Text>

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
        </Page>
      ))}
    </Document>
  );
};

async function main() {
  const model = openai("gpt-4o-mini");

  const embeddingModel = openai.embedding("text-embedding-3-small");

  const result = await storm({
    model,
    embeddingModel,
    topic: "Generate a brief introduction to Real Analysis. Make it accessible to high school students. Include images (type=\"image\") and insights (type=\"insight\") in the content.",
    useResearchTools: false,
    perspectives: 1,
    questions: 1,
    contentSchema
  })
    .catch((error) => {
      log("error", error);
      throw error;
    });

  await fs.promises.writeFile("result.json", JSON.stringify(result, null, 2));
  const stream = await renderToStream(<ArticleComponent article={result.article} />);
  await fs.promises.writeFile("result.pdf", stream);
}

main()
  .catch((error) => {
    log("fatal error", error);

    process.exit(1);
  });
