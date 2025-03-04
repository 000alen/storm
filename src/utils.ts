import type { LanguageModel } from "ai";
import { OpenAI } from "openai";
import { log } from "./logging";

interface NativeGenerateObjectOptions {
  model: LanguageModel;

  schema: any;
  schemaName: string;

  prompt: string;
}

export const openai = new OpenAI();

export const nativeGenerateObject = async <T>(options: NativeGenerateObjectOptions): Promise<{ object: T }> => {
  const { model, schema, schemaName, prompt } = options;

  if (!model.provider.includes("openai")) {
    throw new Error(`Model is not an OpenAI model: ${model.provider}`);
  }

  const response = await openai.beta.chat.completions.parse({
    model: model.modelId,
    messages: [{ role: "user", content: prompt }],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: schemaName,
        schema,
      },
    },
  })
    .catch((error) => {
      log("Error generating object", { error });
      throw error;
    });

  const [choice] = response.choices;

  if (!choice) {
    throw new Error("No choice returned");
  }

  if (!choice.message.parsed) {
    throw new Error("No parsed object returned");
  }

  return { object: choice.message.parsed };
};
