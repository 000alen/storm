import "dotenv/config";

import fs from "fs";
import { storm } from "./src";
import { log } from "./src/logging";
import { openai } from "@ai-sdk/openai";
import { getStream } from "./src/components/article";

async function main() {
  const model = openai("gpt-4o");

  const result = await storm({
    model,
    topic: "Real Analysis",
  })
    .catch((error) => {
      log("error", error);
      throw error;
    });

  await fs.promises.writeFile("result.json", JSON.stringify(result, null, 2));
  const stream = await getStream(result.article);
  await fs.promises.writeFile("result.pdf", stream);
}

main()
  .catch((error) => {
    log("fatal error", error);

    process.exit(1);
  });
