import "dotenv/config";

import fs from "fs";
import { storm } from "./src";
import { log } from "./src/logging";
import { openai } from "@ai-sdk/openai";

async function main() {
  const model = openai("gpt-4o");

  const article = await storm({
    model,
    topic: "Real Analysis",
  })
    .catch((error) => {
      log("error", error);
      throw error;
    });

  console.log(article);

  await fs.promises.writeFile("result.md", JSON.stringify(article, null, 2));
}

main()
  .catch((error) => {
    log("fatal error", error);

    process.exit(1);
  });
