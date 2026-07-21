import type { FastifyPluginAsync } from "fastify";

import type { LlmService } from "../llm/llm.service.js";
import {
  createConversationSchema,
  createMessageSchema,
  deleteConversationSchema,
  getConversationSchema,
  listConversationsSchema,
  streamMessageSchema,
} from "./conversation.schema.js";
import { createConversationService, writeSseEvent } from "./conversation.service.js";
import type {
  ConversationParams,
  CreateConversationInput,
  CreateMessageInput,
} from "./conversation.type.js";

type ConversationRoutesOptions = {
  llmService: LlmService;
};

const conversationRoutes: FastifyPluginAsync<ConversationRoutesOptions> = async (app, options) => {
  const service = createConversationService({
    enableLlm: app.config.OPENAI_API_KEY !== undefined && app.config.OPENAI_API_KEY !== "",
    llmService: options.llmService,
    prisma: app.prisma,
  });

  app.post<{ Body: CreateConversationInput }>(
    "/",
    {
      schema: createConversationSchema,
    },
    async (req, reply) => {
      const conversation = await service.create(req.body);

      return reply.status(201).send(conversation);
    },
  );

  app.get(
    "/",
    {
      schema: listConversationsSchema,
    },
    async (_req, reply) => {
      const conversations = await service.list();

      return reply.status(200).send(conversations);
    },
  );

  app.get<{ Params: ConversationParams }>(
    "/:id",
    {
      schema: getConversationSchema,
    },
    async (req, reply) => {
      const conversation = await service.getById(req.params.id);

      return reply.status(200).send(conversation);
    },
  );

  app.delete<{ Params: ConversationParams }>(
    "/:id",
    {
      schema: deleteConversationSchema,
    },
    async (req, reply) => {
      await service.delete(req.params.id);

      return reply.status(204).send();
    },
  );

  app.post<{ Body: CreateMessageInput; Params: ConversationParams }>(
    "/:id/messages",
    {
      schema: createMessageSchema,
    },
    async (req, reply) => {
      const result = await service.addMessage(req.params.id, req.body);

      return reply.status(201).send(result);
    },
  );

  app.post<{ Body: CreateMessageInput; Params: ConversationParams }>(
    "/:id/messages/stream",
    {
      schema: streamMessageSchema,
    },
    async (req, reply) => {
      const iterator = service.streamMessage(req.params.id, req.body)[Symbol.asyncIterator]();
      const first = await iterator.next();

      reply.hijack();
      reply.raw.writeHead(200, {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      });

      try {
        if (first.done === false) {
          writeSseEvent(reply, first.value.type, first.value);
        }

        let next = await iterator.next();

        while (next.done === false) {
          writeSseEvent(reply, next.value.type, next.value);

          next = await iterator.next();
        }

        writeSseEvent(reply, "done", { ok: true });
      } catch (error) {
        writeSseEvent(reply, "error", {
          message: error instanceof Error ? error.message : "Unexpected stream error",
        });
      } finally {
        reply.raw.end();
      }
    },
  );
};

export default conversationRoutes;
