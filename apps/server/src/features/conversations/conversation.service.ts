import type { Message, MessageRole } from "@prisma/client";
import { FastifyReply } from "fastify/types/reply.js";

import { NotFoundError } from "../../shared/errors/app-error.js";
import type { PrismaLikeClient } from "../../shared/utils/prisma-like.js";
import type { LlmService } from "../llm/llm.service.js";
import type { CreateConversationInput, CreateMessageInput } from "./conversation.type.js";

type ConversationMessageStreamEvent =
  | {
      type: "userMessage";
      userMessage: Message;
    }
  | {
      delta: string;
      type: "delta";
    }
  | {
      assistantMessage: Message;
      type: "assistantMessage";
    };

type ConversationServiceOptions = {
  enableLlm: boolean;
  llmService: LlmService;
  prisma: PrismaLikeClient;
};

export function createConversationService(options: ConversationServiceOptions) {
  const { enableLlm, llmService, prisma } = options;

  async function getById(id: string) {
    const conversation = await prisma.conversationSession.findUnique({
      include: {
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
      where: { id },
    });

    if (conversation === null) {
      throw new NotFoundError("Conversation not found");
    }

    return conversation;
  }

  return {
    async create(input: CreateConversationInput) {
      return prisma.conversationSession.create({
        data: {
          title: input.title ?? "Untitled conversation",
        },
      });
    },

    async list() {
      return prisma.conversationSession.findMany({
        orderBy: {
          updatedAt: "desc",
        },
      });
    },

    getById,

    async delete(id: string) {
      await getById(id);

      await prisma.conversationSession.delete({
        where: { id },
      });
    },

    async addMessage(conversationId: string, input: CreateMessageInput) {
      await getById(conversationId);

      const userMessage = await prisma.message.create({
        data: {
          content: input.content,
          conversationId,
          role: "USER",
        },
      });

      if (enableLlm === false) {
        return {
          assistantMessage: null,
          userMessage,
        };
      }

      const history = await prisma.message.findMany({
        orderBy: {
          createdAt: "asc",
        },
        select: {
          content: true,
          role: true,
        },
        where: {
          conversationId,
        },
      });

      const assistant = await llmService.generateAssistantMessage(
        history.map((message) => ({
          content: message.content,
          role: message.role as MessageRole,
        })),
      );

      const assistantMessage = await prisma.message.create({
        data: {
          content: assistant.content,
          conversationId,
          role: "ASSISTANT",
        },
      });

      return {
        assistantMessage,
        userMessage,
      };
    },

    async *streamMessage(
      conversationId: string,
      input: CreateMessageInput,
    ): AsyncIterable<ConversationMessageStreamEvent> {
      await getById(conversationId);

      const userMessage = await prisma.message.create({
        data: {
          content: input.content,
          conversationId,
          role: "USER",
        },
      });

      yield {
        type: "userMessage",
        userMessage,
      };

      if (enableLlm === false) {
        return;
      }

      const history = await prisma.message.findMany({
        orderBy: {
          createdAt: "asc",
        },
        select: {
          content: true,
          role: true,
        },
        where: {
          conversationId,
        },
      });

      let assistantContent = "";

      for await (const delta of llmService.streamAssistantMessage(
        history.map((message) => ({
          content: message.content,
          role: message.role as MessageRole,
        })),
      )) {
        assistantContent += delta;

        yield {
          delta,
          type: "delta",
        };
      }

      if (assistantContent !== "") {
        const assistantMessage = await prisma.message.create({
          data: {
            content: assistantContent,
            conversationId,
            role: "ASSISTANT",
          },
        });

        yield {
          assistantMessage,
          type: "assistantMessage",
        };
      }
    },
  };
}

export function writeSseEvent(reply: FastifyReply, event: string, data: unknown) {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}
