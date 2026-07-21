import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../app.js";
import type { LlmService } from "../features/llm/llm.service.js";
import { createInMemoryPrisma } from "./in-memory-prisma.js";

const originalEnv = { ...process.env };

describe("conversation routes", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("creates a conversation", async () => {
    const app = await buildApp({ prisma: createInMemoryPrisma() });

    const response = await app.inject({
      method: "POST",
      payload: { title: "Planning" },
      url: "/conversations",
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      title: "Planning",
    });

    await app.close();
  });

  it("lists conversations", async () => {
    const app = await buildApp({ prisma: createInMemoryPrisma() });

    await app.inject({ method: "POST", payload: { title: "First" }, url: "/conversations" });
    await app.inject({ method: "POST", payload: { title: "Second" }, url: "/conversations" });

    const response = await app.inject({
      method: "GET",
      url: "/conversations",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(2);

    await app.close();
  });

  it("gets conversation history", async () => {
    const app = await buildApp({ prisma: createInMemoryPrisma() });

    const created = await app.inject({
      method: "POST",
      payload: { title: "History" },
      url: "/conversations",
    });
    const conversationId = created.json().id as string;

    await app.inject({
      method: "POST",
      payload: { content: "Hello" },
      url: `/conversations/${conversationId}/messages`,
    });

    const response = await app.inject({
      method: "GET",
      url: `/conversations/${conversationId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: conversationId,
      messages: [
        {
          content: "Hello",
          role: "USER",
        },
      ],
    });

    await app.close();
  });

  it("deletes a conversation and cascades messages", async () => {
    const app = await buildApp({ prisma: createInMemoryPrisma() });

    const created = await app.inject({
      method: "POST",
      payload: { title: "Temporary" },
      url: "/conversations",
    });
    const conversationId = created.json().id as string;

    await app.inject({
      method: "POST",
      payload: { content: "Remove me too" },
      url: `/conversations/${conversationId}/messages`,
    });

    const deleted = await app.inject({
      method: "DELETE",
      url: `/conversations/${conversationId}`,
    });
    const lookup = await app.inject({
      method: "GET",
      url: `/conversations/${conversationId}`,
    });

    expect(deleted.statusCode).toBe(204);
    expect(lookup.statusCode).toBe(404);

    await app.close();
  });

  it("adds a user message without calling the LLM during CRUD mode", async () => {
    const llmService: LlmService = {
      generateAssistantMessage: vi.fn(),
      streamAssistantMessage: vi.fn(),
    };
    const app = await buildApp({ llmService, prisma: createInMemoryPrisma() });

    const created = await app.inject({
      method: "POST",
      payload: { title: "CRUD" },
      url: "/conversations",
    });
    const conversationId = created.json().id as string;

    const response = await app.inject({
      method: "POST",
      payload: { content: "Save this only" },
      url: `/conversations/${conversationId}/messages`,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      assistantMessage: null,
      userMessage: {
        content: "Save this only",
        role: "USER",
      },
    });
    expect(llmService.generateAssistantMessage).not.toHaveBeenCalled();

    await app.close();
  });

  it("uses generateAssistantMessage LLM Service with mock content", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-test";

    const llmService: LlmService = {
      generateAssistantMessage: vi.fn().mockResolvedValue({ content: "Assistant reply" }),
      streamAssistantMessage: vi.fn(),
    };
    const app = await buildApp({ llmService, prisma: createInMemoryPrisma() });

    const created = await app.inject({
      method: "POST",
      payload: { title: "LLM" },
      url: "/conversations",
    });
    const conversationId = created.json().id as string;

    const response = await app.inject({
      method: "POST",
      payload: { content: "Hello model" },
      url: `/conversations/${conversationId}/messages`,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      assistantMessage: {
        content: "Assistant reply",
        role: "ASSISTANT",
      },
      userMessage: {
        content: "Hello model",
        role: "USER",
      },
    });
    expect(llmService.generateAssistantMessage).toHaveBeenCalledWith([
      {
        content: "Hello model",
        role: "USER",
      },
    ]);

    await app.close();
  });

  it("uses streamAssistantMessage LLM Service with mock content", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-test";

    const llmService: LlmService = {
      generateAssistantMessage: vi.fn(),

      streamAssistantMessage: vi.fn(async function* () {
        yield "Hello! ";
        yield "This is ";
        yield "a mocked ";
        yield "streaming response ";
        yield "from the assistant. ";
        yield "Each chunk ";
        yield "represents ";
        yield "a portion ";
        yield "of the generated ";
        yield "text, similar ";
        yield "to how ";
        yield "OpenAI streams ";
        yield "tokens incrementally.";
      }),
    };

    const app = await buildApp({
      llmService,
      prisma: createInMemoryPrisma(),
    });

    const created = await app.inject({
      method: "POST",
      url: "/conversations",
      payload: {
        title: "LLM",
      },
    });

    const conversationId = created.json().id as string;

    const response = await app.inject({
      method: "POST",
      url: `/conversations/${conversationId}/messages/stream`,
      payload: {
        content: "test LLM stream",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");

    expect(llmService.streamAssistantMessage).toHaveBeenCalledWith([
      {
        role: "USER",
        content: "test LLM stream",
      },
    ]);

    expect(response.body).toContain("Hello!");
    expect(response.body).toContain("This is");
    expect(response.body).toContain("streaming response");
    expect(response.body).toContain("tokens incrementally.");

    expect(response.body).toContain("event: done");
    expect(response.body).toContain('"ok":true');

    await app.close();
  });
});
