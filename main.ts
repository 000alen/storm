import "dotenv/config";

import fs from "fs";
import { openai } from "@ai-sdk/openai";
import { graphOfThought } from "./src";
import { log } from "./src/logging";

async function main() {
  const { result } = await graphOfThought({
    model: openai("o3-mini"),
    context: "You are a helpful assistant. You plan before you act.",
    task: "Write a article about Real Analysis. The article should be 3000 words long and should have several sections. Divide the word count as you see fit.",
    aggregate: true
  })
    .catch(
      (error) => {
        log("error", error);
        throw error;
      }
    );

  if (!result) {
    log("no result");
    throw new Error("no result");
  }

  console.log(result);

  await fs.promises.writeFile("result.md", result);
}

main()
  .catch((error) => {
    log("fatal error", error);

    process.exit(1);
  });
