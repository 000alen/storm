import { z } from "zod";

// Type to extract parameters from a template literal
type ExtractParams<T extends string> = T extends `${string}{${infer Param}}${infer Rest}`
  ? Param | ExtractParams<Rest>
  : never;

// Create a record type from template parameters
type ParamsToRecord<T extends string> = {
  [K in ExtractParams<T>]: string;
};

export class Template<T extends string> {
  private template: T;
  private schema: z.ZodType;

  constructor(template: T, schema?: z.ZodType) {
    this.template = template;
    this.schema = schema || z.object(
      Object.fromEntries(
        Array.from(template.matchAll(/{([^}]+)}/g))
          .map(match => [match[1], z.string()])
      )
    );
  }

  format(params: ParamsToRecord<T>): string {
    // Validate parameters against schema
    this.schema.parse(params);

    return Object.entries(params).reduce<string>(
      (result, [key, value]) => result.replace(`{${key}}`, String(value)),
      this.template
    );
  }
}

// Helper function to create prompt templates with type inference
export function createTemplate<T extends string>(
  template: T,
  schema?: z.ZodType
): Template<T> {
  return new Template(template, schema);
}
