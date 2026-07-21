import type { MessageRole } from "@prisma/client";

import type { PrismaLikeClient } from "../shared/utils/prisma-like.js";

type ConversationRecord = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

type MessageRecord = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
};

type CreateConversationArgs = {
  data: {
    title: string;
  };
};

type ConversationIdArgs = {
  where: {
    id: string;
  };
};

type FindConversationArgs = ConversationIdArgs & {
  include?: {
    messages?: unknown;
  };
};

type CreateMessageArgs = {
  data: {
    content: string;
    conversationId: string;
    role: MessageRole;
  };
};

type FindMessagesArgs = {
  select?: unknown;
  where?: {
    conversationId?: string;
  };
};

let idCounter = 0;

function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export function createInMemoryPrisma(): PrismaLikeClient {
  const conversations = new Map<string, ConversationRecord>();
  const messages = new Map<string, MessageRecord>();

  return {
    conversationSession: {
      async create(args: CreateConversationArgs) {
        const now = new Date();
        const conversation = {
          createdAt: now,
          id: nextId("conversation"),
          title: args.data.title,
          updatedAt: now,
        };

        conversations.set(conversation.id, conversation);

        return conversation;
      },

      async delete(args: ConversationIdArgs) {
        const conversation = conversations.get(args.where.id);

        if (conversation === undefined) {
          throw new Error("Record not found");
        }

        conversations.delete(args.where.id);

        for (const [id, message] of messages) {
          if (message.conversationId === args.where.id) {
            messages.delete(id);
          }
        }

        return conversation;
      },

      async findMany() {
        return [...conversations.values()].sort(
          (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
        );
      },

      async findUnique(args: FindConversationArgs) {
        const conversation = conversations.get(args.where.id);

        if (conversation === undefined) {
          return null;
        }

        if (args.include?.messages === undefined) {
          return conversation;
        }

        const conversationMessages = [...messages.values()]
          .filter((message) => message.conversationId === conversation.id)
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

        return {
          ...conversation,
          messages: conversationMessages,
        };
      },
    },

    message: {
      async create(args: CreateMessageArgs) {
        const now = new Date();
        const message = {
          content: args.data.content,
          conversationId: args.data.conversationId,
          createdAt: now,
          id: nextId("message"),
          role: args.data.role,
        };

        messages.set(message.id, message);

        const conversation = conversations.get(message.conversationId);

        if (conversation !== undefined) {
          conversation.updatedAt = now;
        }

        return message;
      },

      async findMany(args: FindMessagesArgs) {
        const conversationMessages = [...messages.values()]
          .filter((message) => message.conversationId === args.where?.conversationId)
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

        if (args.select !== undefined) {
          return conversationMessages.map((message) => ({
            content: message.content,
            role: message.role,
          }));
        }

        return conversationMessages;
      },
    },
  } as unknown as PrismaLikeClient;
}
