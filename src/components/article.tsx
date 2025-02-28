import { Document, Page, Text, View, StyleSheet, renderToStream } from '@react-pdf/renderer';
import type { Article as ArticleType, ArticleSection as ArticleSectionType } from '../types';

// Create styles for PDF document
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    marginBottom: 20,
    color: '#666',
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 15,
    marginBottom: 5,
  },
  sectionDescription: {
    fontSize: 12,
    marginBottom: 10,
    color: '#666',
    fontStyle: 'italic',
  },
  sectionContent: {
    fontSize: 12,
    marginBottom: 15,
    lineHeight: 1.5,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 5,
    paddingLeft: 10,
  },
  subsectionDescription: {
    fontSize: 10,
    marginBottom: 5,
    color: '#666',
    fontStyle: 'italic',
    paddingLeft: 10,
  },
  subsectionContent: {
    fontSize: 10,
    marginBottom: 10,
    lineHeight: 1.5,
    paddingLeft: 10,
  },
  viewer: {
    width: '100%',
    height: '100vh',
  },
});

// Recursive component to render article sections and their children
const ArticleSection = ({ section, level = 0 }: { section: ArticleSectionType; level?: number }) => (
  <View>
    <Text style={level === 0 ? styles.sectionTitle : styles.subsectionTitle}>
      {section.title}
    </Text>
    <Text style={level === 0 ? styles.sectionDescription : styles.subsectionDescription}>
      {section.description}
    </Text>
    <Text style={level === 0 ? styles.sectionContent : styles.subsectionContent}>
      {section.content}
    </Text>

    {section.children.map((child, index) => (
      <ArticleSection key={index} section={child} level={level + 1} />
    ))}
  </View>
);

// The main PDF Document component
const Article = ({ article }: { article: ArticleType }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <Text style={styles.title}>{article.title}</Text>
      <Text style={styles.description}>{article.description}</Text>

      {article.sections.map((section, index) => (
        <ArticleSection key={index} section={section} />
      ))}
    </Page>
  </Document>
);

// Function to render the PDF to a Node.js stream (server-side)
export const getStream = async (
  article: ArticleType,
  ArticleComponent: React.ComponentType<{ article: ArticleType }> = Article
) => {
  return await renderToStream(<ArticleComponent article={article} />);
};

export default Article;
