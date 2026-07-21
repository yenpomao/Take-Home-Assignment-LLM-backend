import type { LlmMessage, LlmResponse } from "./llm.type.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export type LlmProvider = {
  complete(messages: LlmMessage[]): Promise<LlmResponse>;
  stream(messages: LlmMessage[]): AsyncIterable<string>;
};

type ProviderConfig = {
  apiKey?: string;
  model: string;
};

type OpenAIResponsesBody = {
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
  output_text?: string;
};

type OpenAIResponseStreamEvent = {
  delta?: string;
  error?: {
    message?: string;
  };
  type?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toOpenAiStreamEvent(value: unknown): OpenAIResponseStreamEvent {
  if (isRecord(value) === false) {
    return {};
  }

  const error = value.error;

  return {
    delta: typeof value.delta === "string" ? value.delta : undefined,
    error:
      isRecord(error) && typeof error.message === "string" ? { message: error.message } : undefined,
    type: typeof value.type === "string" ? value.type : undefined,
  };
}

function extractOutputText(body: OpenAIResponsesBody): string | undefined {
  if (body.output_text !== undefined && body.output_text !== "") {
    return body.output_text;
  }

  return body.output
    ?.flatMap((item) => item.content ?? [])
    .find(
      (content) =>
        content.type === "output_text" && content.text !== undefined && content.text !== "",
    )?.text;
}

async function* streamResponseText(response: Response): AsyncIterable<string> {
  if (response.body === null) {
    throw new Error("OpenAI API stream response is missing a body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const result = await reader.read();

    if (result.done === true) {
      break;
    }

    buffer += decoder.decode(result.value, { stream: true });

    let eventEndIndex = buffer.indexOf("\n\n");

    while (eventEndIndex !== -1) {
      const rawEvent = buffer.slice(0, eventEndIndex);
      buffer = buffer.slice(eventEndIndex + 2);

      const data = rawEvent
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trimStart())
        .join("\n");

      if (data !== "" && data !== "[DONE]") {
        const event = toOpenAiStreamEvent(JSON.parse(data) as unknown);

        if (event.type === "response.output_text.delta" && event.delta !== undefined) {
          yield event.delta;
        }

        if (event.type === "response.failed") {
          throw new Error(event.error?.message ?? "OpenAI API stream failed");
        }
      }

      eventEndIndex = buffer.indexOf("\n\n");
    }
  }
}

export function createOpenAiProvider(config: ProviderConfig): LlmProvider {
  return {
    async complete(messages) {
      if (config.apiKey === undefined || config.apiKey === "") {
        throw new Error("OPENAI_API_KEY is required for OpenAI calls");
      }

      const response = await fetch(OPENAI_RESPONSES_URL, {
        body: JSON.stringify({
          input: messages,
          model: config.model,
        }),
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (response.ok === false) {
        const errorBody = await response.text();
        throw new Error(`OpenAI API failed with status ${response.status}: ${errorBody}`);
      }

      const body = (await response.json()) as OpenAIResponsesBody;
      const content = extractOutputText(body);

      if (content === undefined || content === "") {
        throw new Error("OpenAI API response is missing output text");
      }

      return { content };
    },

    async *stream(messages) {
      if (config.apiKey === undefined || config.apiKey === "") {
        throw new Error("OPENAI_API_KEY is required for OpenAI calls");
      }

      const response = await fetch(OPENAI_RESPONSES_URL, {
        body: JSON.stringify({
          input: messages,
          model: config.model,
          stream: true,
        }),
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (response.ok === false) {
        const errorBody = await response.text();
        throw new Error(`OpenAI API failed with status ${response.status}: ${errorBody}`);
      }

      yield* streamResponseText(response);
    },
  };
}
