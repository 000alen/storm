import { type LanguageModel, type ToolSet, generateObject, generateText } from "ai";
import { z } from "zod";
import { createTemplate } from "@/template";
import { log } from "@/logging";
import toposort from "@000alen/toposort";

const nodeSchema = z
  .object({
    name: z.string().describe("The name of the node in the compute graph"),
    description: z.string().describe("A description of the node's purpose. Should be a high-level overview of this node's contribution to the task.")
  })

const edgeSchema = z.object({
  source: z.string().describe("The name of the source node"),
  target: z.string().describe("The name of the target node. This node should depend on the source node.")
});

const resultSchema = nodeSchema.extend({
  result: z.string().describe("The result of the node's execution.")
});

type Node = z.infer<typeof nodeSchema>;
type Edge = z.infer<typeof edgeSchema>;
type Result = z.infer<typeof resultSchema>;

export interface GraphOfThoughtOptions {
  model: LanguageModel;
  context: string;
  task: string;
  aggregate?: boolean;
  tools?: ToolSet;
}

export interface GraphOfThoughtResult {
  nodes: Node[];
  edges: Edge[];
  results: Map<string, Result>;
  result: string | undefined;
}


const nodeGenerationPrompt = createTemplate(
  "Given the context: {context}\n" +
  "And the task: {task}\n" +
  "Generate a list of thought nodes that would help solve this task."
);

const edgeGenerationPrompt = createTemplate(
  "Given these nodes: {nodes}\n" +
  "Generate the connections between these nodes to form a directed acyclic graph."
);

const taskExecutionPrompt = createTemplate(
  "Given the context: {context}\n" +
  "And the dependencies: {dependencies}\n" +
  "And the task: {task}\n" +
  "Execute the task."
);

const aggregateTaskExecutionPrompt = createTemplate(
  "Given the context: {context}\n" +
  "And the tasks: {tasks}\n" +
  "Aggregate the results of the tasks, into a single result."
);

function getDependencies<T>(node: T, _nodes: T[], edges: [T, T][]): T[] {
  const dependencies = new Set<T>();

  for (const [source, target] of edges)
    if (target === node)
      dependencies.add(source);

  return Array.from(dependencies);
}

export async function graphOfThought(options: GraphOfThoughtOptions): Promise<GraphOfThoughtResult> {
  const { model, context, task, aggregate = false, tools = {} } = options;

  const nodesPrompt = nodeGenerationPrompt.format({
    context,
    task
  });

  const { object: { nodes } } = await generateObject({
    model,
    prompt: nodesPrompt,
    schema: z.object({
      nodes: nodeSchema.array()
    }),
  })
    .catch((error) => {
      log("error generating nodes", { error });
      throw error;
    });

  log("generated nodes", { nodes: nodes.length });

  const edgesPrompt = edgeGenerationPrompt.format({
    nodes: JSON.stringify(nodes)
  });

  const { object: { edges } } = await generateObject({
    model,
    prompt: edgesPrompt,
    schema: z.object({
      edges: edgeSchema.array()
    }),
  })
    .catch((error) => {
      log("error generating edges", { error });
      throw error;
    });

  log("generated edges", { edges: edges.length });

  const _nodes = nodes.map((node) => node.name);
  const _edges = edges.map((edge) => [edge.source, edge.target] as [string, string]);

  const segments = toposort.parallel(
    _nodes,
    _edges
  );

  log("generated segments", { segments: segments.length });

  // _node -> index
  const indexes = new Map<string, number>(
    nodes.map((node, index) => [node.name, index])
  );

  // _node -> string
  const results = new Map<string, Result>();

  for (const segment of segments) {
    log("executing segment", { segment: segment.length });

    await Promise
      .all(segment.map(async (_node) => {
        log("executing node", { node: _node });

        const _dependencies = getDependencies(_node, _nodes, _edges);
        const dependencyResults = _dependencies.map((dependency) => results.get(dependency)!);

        const node = nodes[indexes.get(_node)!]!;

        const { text } = await generateText({
          model,
          tools,
          maxSteps: 10,
          prompt: taskExecutionPrompt.format({
            context,
            dependencies: JSON.stringify(dependencyResults),
            task
          })
        })
          .catch((error) => {
            log("error executing node", { error, node: _node });
            throw error;
          });

        results.set(_node, {
          ...node,
          result: text
        });
      }))
      .catch((error) => {
        log("error executing segment", { error, segment });
        throw error;
      });
  }

  let result: string | undefined;
  if (aggregate) {
    log("aggregating tasks");

    const { text } = await generateText({
      model,
      prompt: aggregateTaskExecutionPrompt.format({
        context,
        tasks: JSON.stringify(
          nodes.map((node) => results.get(node.name)!.result)
        ),
        task
      })
    })
      .catch((error) => {
        log("error aggregating tasks", { error });
        throw error;
      });

    result = text;
  }

  return {
    nodes,
    edges,
    results,
    result
  };
}
