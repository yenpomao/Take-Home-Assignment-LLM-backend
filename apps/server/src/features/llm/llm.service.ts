import type { MessageRole } from "@prisma/client";

import { type LlmProvider, createOpenAiProvider } from "./llm.provider.js";
import type { LlmMessage, LlmResponse } from "./llm.type.js";

type LlmServiceConfig = {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL: string;
};

export type ConversationMessageForLlm = {
  role: MessageRole;
  content: string;
};

export type LlmService = {
  generateAssistantMessage(messages: ConversationMessageForLlm[]): Promise<LlmResponse>;
  streamAssistantMessage(messages: ConversationMessageForLlm[]): AsyncIterable<string>;
};

function toLlmMessage(message: ConversationMessageForLlm): LlmMessage {
  return {
    content: message.content,
    role: message.role === "USER" ? "user" : "assistant",
  };
}

export function createLlmService(
  config: LlmServiceConfig,
  provider: LlmProvider = createOpenAiProvider({
    apiKey: config.OPENAI_API_KEY,
    model: config.OPENAI_MODEL,
  }),
): LlmService {
  return {
    async generateAssistantMessage(messages) {
      return provider.complete(messages.map(toLlmMessage));
    },

    streamAssistantMessage(messages) {
      return provider.stream(messages.map(toLlmMessage));
    },
  };
}
