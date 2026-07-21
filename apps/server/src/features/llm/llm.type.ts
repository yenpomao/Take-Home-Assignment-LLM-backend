export type LlmMessageRole = "user" | "assistant";

export type LlmMessage = {
  role: LlmMessageRole;
  content: string;
};

export type LlmResponse = {
  content: string;
};
