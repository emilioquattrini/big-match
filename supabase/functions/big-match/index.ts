import { createHandler } from './handler.ts';

// The narrow declaration allows Node/TypeScript checking without Deno-specific dependencies.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): unknown;
};

Deno.serve(createHandler({ env: (name) => Deno.env.get(name) }));
