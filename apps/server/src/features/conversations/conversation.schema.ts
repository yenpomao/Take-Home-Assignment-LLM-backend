const idParamSchema = {
  params: {
    additionalProperties: false,
    properties: {
      id: { minLength: 1, type: "string" },
    },
    required: ["id"],
    type: "object",
  },
} as const;

export const createConversationSchema = {
  body: {
    additionalProperties: false,
    properties: {
      title: { minLength: 1, type: "string" },
    },
    type: "object",
  },
} as const;

export const listConversationsSchema = {} as const;

export const getConversationSchema = idParamSchema;

export const deleteConversationSchema = idParamSchema;

export const createMessageSchema = {
  body: {
    additionalProperties: false,
    properties: {
      content: { minLength: 1, type: "string" },
    },
    required: ["content"],
    type: "object",
  },
  params: idParamSchema.params,
} as const;

export const streamMessageSchema = createMessageSchema;
