import { z } from "zod";
import { stripIndent } from "common-tags";
import { log } from "./logging";

const promptLog = log.extend("prompt");

export { stripIndent };

export type TemplatePart<TParams> = (params: TParams) => string;

export type TemplateStringPart = string;

export type TemplateParts<TParams> = Array<TemplateStringPart | TemplatePart<TParams> | undefined>;

export class Template<TParams extends Record<string, any>> {
  private parts: TemplateParts<TParams>;
  private schema: z.ZodType<TParams>;

  constructor(parts: TemplateParts<TParams>, schema: z.ZodType<TParams>) {
    this.parts = parts;
    this.schema = schema;
  }

  format(params: TParams): string {
    // Validate parameters against schema
    this.schema.parse(params);

    // Process each part of the template
    const formattedPrompt = this.parts.map(part => {
      if (part === undefined) {
        return '';
      }
      if (typeof part === 'function') {
        return part(params);
      }
      return part;
    }).join('');

    // Log the formatted prompt
    promptLog("Formatted prompt:\n%s", formattedPrompt);

    return formattedPrompt;
  }
}

export function template<TParams extends Record<string, any>>(
  schema: z.ZodType<TParams>
) {
  return (strings: TemplateStringsArray, ...expressions: Array<TemplatePart<TParams> | string | undefined>) => {
    const parts: TemplateParts<TParams> = [];

    // Interleave strings and expressions
    for (let i = 0; i < strings.length; i++) {
      parts.push(strings[i]);
      if (i < expressions.length) {
        const expr = expressions[i];
        if (expr !== undefined) {
          if (typeof expr === 'function') {
            parts.push(expr as TemplatePart<TParams>);
          } else {
            parts.push(expr);
          }
        }
      }
    }

    return new Template<TParams>(parts, schema);
  };
}
