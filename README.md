# LLM Chat Backend

A Node.js-Fastify backend for an AI chat application with multiple conversation sessions.

## Architecture

```mermaid
flowchart TD
    Client[Client Application<br/>Web / Mobile] --> API[Fastify API Layer]

    API --> Routes[Route Handlers]
    Routes --> Service[Conversation Service]

    Service --> DB[Prisma ORM]
    DB --> PostgreSQL[(PostgreSQL Database)]

    Service --> OpenAI[OpenAI LLM Service]

    OpenAI --> OpenAIAPI[OpenAI API]
```

## Database Schema


detailed can be viewed in `prisma\schema.prisma`

`ConversationSession` stores each conversation:

- `id`
- `title`
- `createdAt`
- `updatedAt`

`Message` stores conversation messages:

- `id`
- `conversationId`
- `role`
- `content`
- `createdAt`

`MessageRole` can be `USER` or `ASSISTANT`. 

## API

### Create conversation

```http
POST /conversations
```
Payload: `title` 

Returns `201` with the created conversation. `title` is optional and defaults to `Untitled conversation`.

### List conversations

```http
GET /conversations
```

Returns `200` with conversations ordered by `updatedAt` descending.

### Get conversation messages

```http
GET /conversations/:id
```

Returns `200` with the conversation and messages ordered oldest first. Returns `404` when missing.

### Delete conversation

```http
DELETE /conversations/:id
```

Returns `204`. Related messages are deleted by PostgreSQL cascade through Prisma.

### Create message

```http
POST /conversations/:id/messages
```
Payload: `content*`

Returns `201` with the saved `USER` message. If `OPENAI_API_KEY` is configured, the service sends conversation history through the LLM service, saves an `ASSISTANT` message, and returns both messages.

```http
POST /conversations/:id/messages/stream
```
Payload: `content*`

Similar to previous one but the response is send token by token instead of wait whole texts finished.  

## Environment

Copy `.env.example` to `.env` and update values as needed.

```text
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/llm_chat?schema=public"
OPENAI_API_KEY=""
OPENAI_MODEL="gpt-5"
PORT=3000
```

## Development
For `Docker` check Docker section.
```bash
pnpm install
pnpm --filter server prisma:generate
pnpm --filter server prisma:migrate
pnpm dev
```

## Tests

```bash
pnpm test
```

Tests use Vitest and Fastify injection. They mock the LLM service response and use an in-memory Prisma to fake so the route and service behavior can be verified without calling a real model.


## Docker

```bash
docker compose up --build
```

The API is exposed on `http://localhost:3000`, and PostgreSQL is exposed on `localhost:5454`.

## Build vs Reuse Decisions

- Fastify is a high-performance web framework that provides excellent benchmark performance, native route typing, and built-in schema validation.
- Prisma is a type-safe ORM that simplifies database queries, improves code maintainability though schema management.
- Vitest is a test framework that native TypeScript and ESM supported.
