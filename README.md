# Template System

A flexible and type-safe template system for creating and formatting text templates with dynamic content.

## Features

- Type-safe templates with Zod schema validation
- Tagged template literals for easy template creation
- Support for dynamic content through function expressions
- Backward compatibility with the previous template system

## Usage

### Creating a Template

```typescript
import { template, stripIndent } from "./template";
import { z } from "zod";

// Define a schema for your template parameters
const schema = z.object({
  name: z.string(),
  age: z.number(),
  hobbies: z.array(z.string()).optional(),
});

// Create a template using the tagged template function
const greetingTemplate = template(schema)`
Hello, ${params => params.name}!

You are ${params => params.age} years old.

${params => params.hobbies ? `
Your hobbies include:
${params => params.hobbies?.map(hobby => `- ${hobby}`).join('\n')}
` : 'You have not listed any hobbies.'}

Nice to meet you!
`;
```

### Using a Template

```typescript
// Format the template with parameters
const result = greetingTemplate.format({
  name: "Alice",
  age: 30,
  hobbies: ["Reading", "Hiking", "Coding"],
});

console.log(result);
```

### Output

```
Hello, Alice!

You are 30 years old.

Your hobbies include:
- Reading
- Hiking
- Coding

Nice to meet you!
```

## Template Parts

Templates can include:

1. Static text
2. Functions that take parameters and return a string
3. Conditional expressions using template literals within functions

## Benefits Over the Previous System

1. More flexible - parts of the template can be functions that dynamically generate content
2. More type-safe - parameter types are enforced by Zod schema
3. More expressive - conditional rendering is more natural with template literals
4. Better developer experience - tagged templates provide better syntax highlighting and editor support

