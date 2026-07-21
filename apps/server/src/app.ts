import Fastify, { type FastifyInstance } from "fastify";

import conversationRoutes from "./features/conversations/conversation.route.js";
import type { LlmService } from "./features/llm/llm.service.js";
import { createLlmService } from "./features/llm/llm.service.js";
import { envPlugin } from "./plugins/env.js";
import { AppError } from "./shared/errors/app-error.js";
import type { PrismaLikeClient } from "./shared/utils/prisma-like.js";

type BuildAppOptions = {
  prisma: PrismaLikeClient;
  llmService?: LlmService;
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function hasValidationError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "validation" in error;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
  });

  await app.register(envPlugin);
  app.decorate("prisma", options.prisma);

  const llmService = options.llmService ?? createLlmService(app.config);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.name,
        message: error.message,
      });
    }

    if (hasValidationError(error)) {
      return reply.status(400).send({
        error: "ValidationError",
        message: getErrorMessage(error, "Request validation failed"),
      });
    }

    app.log.error(error);

    return reply.status(500).send({
      error: "InternalServerError",
      message: "Unexpected server error",
    });
  });

  app.get("/health", async () => ({ status: "ok" }));
  await app.register(conversationRoutes, { llmService, prefix: "/conversations" });

  return app;
}
