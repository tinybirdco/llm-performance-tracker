This is a template for an LLM performance tracker dashboard and LLM cost calculator. It is built with Next.js, [Tinybird](https://tinybird.co) and [Clerk](https://clerk.com)

Use this template to bootstrap a multi-tenant, user-facing LLM analytics dashboard and cost calculator.

Features:

- Track LLM costs, requests, tokens and duration by model, provider, organization, project, environment and user
- Multi-tenant user-facing dashboard
- AI cost calculator
- Vector search
- Ask AI integration

Fork it and make it your own! You can track your own metrics and dimensions.

## Set up the project

Fork the GitHub repository and deploy the data project to Tinybird.

```bash
# install the tinybird CLI
curl https://tinybird.co | sh

# select or create a new workspace
tb login

# deploy the template
tb --cloud deploy --template https://github.com/tinybirdco/llm-performance-tracker/tree/main/tinybird
```

## Instrumentation

Send your data to Tinybird using the [Events API](https://www.tinybird.co/docs/get-data-in/ingest-apis/events-api). Some examples:

- [LiteLLM (Python)](https://www.tinybird.co/docs/get-data-in/guides/ingest-litellm)
- [Vercel AI SDK (TypeScript)](https://www.tinybird.co/docs/get-data-in/guides/ingest-vercel-ai-sdk)

## Use the hosted app

```bash
# copy the token to the clipboard
tb --cloud token copy read_pipes && TINYBIRD_TOKEN=$(pbpaste)

# use the hosted dashboard with your data
open https://llm-tracker.tinybird.live\?token\=$TINYBIRD_TOKEN
```

## Log the app's own AI calls

The dashboard's AI features log their LLM calls to `llm_events` when `TINYBIRD_EVENTS_TOKEN` is set. Use the `llm_events_append` token (append-only on `llm_events`), never the admin token. If it's unset, those calls aren't logged.

## Local development, multi-tenancy, customization and more 

See [README.md](https://github.com/tinybirdco/llm-performance-tracker?tab=readme-ov-file#build-and-deploy-your-own-llm-tracker)

## Tech stack

- [Next.js](https://nextjs.org/) - Application
- [Tinybird](https://tinybird.co) - Analytics
- [OpenAI](https://openai.com/) - AI features
- [Vercel AI SDK](https://sdk.vercel.ai/docs/introduction) - AI features
- [Vercel](https://sdk.vercel.ai/docs/introduction) - Application deployment
- [Clerk](https://clerk.com/) - User management and auth
- [Tremor](https://tremor.so/) - Charts
