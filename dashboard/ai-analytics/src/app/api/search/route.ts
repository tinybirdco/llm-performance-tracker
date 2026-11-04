import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { generateRandomChatId, hashApiKeyUser, wrapModelWithTinybird } from '@/lib/tinybird-wrapper';
import { fetchAvailableDimensions, isAllowedTinybirdApiUrl } from '@/lib/dimensions';

const MAX_PROMPT_LENGTH = 1000;

export async function POST(req: Request) {
  const { prompt, apiKey } = await req.json();
  const token = req.headers.get('x-custom-tinybird-token');
  const apiUrl = req.headers.get('x-custom-tinybird-api-url');

  if (apiUrl && !isAllowedTinybirdApiUrl(apiUrl)) {
    return Response.json({ error: 'Invalid Tinybird API URL' }, { status: 400 });
  }

  if (typeof prompt !== 'string' || prompt.length > MAX_PROMPT_LENGTH) {
    return Response.json({ error: `Prompt must be a string of at most ${MAX_PROMPT_LENGTH} characters` }, { status: 400 });
  }

  if (!apiKey) {
    return Response.json({ error: 'OpenAI API key is required' }, { status: 400 });
  }

  try {
    // Fetch available dimensions
    const availableDimensions = await fetchAvailableDimensions(token, apiUrl);
    console.log(availableDimensions);
    
    // Create the schema outside the function call
    const filterSchema = z.object({
      model: z.enum((availableDimensions?.data?.[0]?.model || ['gpt-4']) as [string, ...string[]]).optional(),
      provider: z.enum((availableDimensions?.data?.[0]?.provider || ['openai']) as [string, ...string[]]).optional(),
      environment: z.enum((availableDimensions?.data?.[0]?.environment || ['production']) as [string, ...string[]]).optional(),
      organization: z.enum((availableDimensions?.data?.[0]?.organizations || ['']) as [string, ...string[]]).optional(),
      project: z.enum((availableDimensions?.data?.[0]?.project || ['']) as [string, ...string[]]).optional(),
      date_range: z.enum(['last month', 'last week'] as [string, ...string[]]).optional(),
    });

    const systemPromptText = `You are a filter parser for an analytics dashboard. Convert natural language into filter key-value pairs.
    Available dimensions: ${Object.keys(availableDimensions?.data?.[0] || {}).join(', ')}.
    Common values: ${JSON.stringify(availableDimensions?.data?.[0] || {}, null, 2)}.
    Return only valid values from the provided dimensions, fix typos when necessary.`;
    console.log(systemPromptText);
    
    const openai = createOpenAI({ apiKey: apiKey });
    const wrappedOpenAI = wrapModelWithTinybird(
      openai('gpt-3.5-turbo'),
      process.env.NEXT_PUBLIC_TINYBIRD_API_URL!,
      process.env.TINYBIRD_EVENTS_TOKEN,
      {
        event: 'search_filter',
        environment: process.env.NODE_ENV,
        project: 'llm-tracker',
        organization: 'tinybird',
        chatId: generateRandomChatId(),
        user: hashApiKeyUser(apiKey),
        systemPrompt: systemPromptText,
      }
    );

    const result = await generateObject({
      model: wrappedOpenAI,
      schema: filterSchema,
      prompt,
      systemPrompt: systemPromptText,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    return Response.json(result.object);
  } catch (error) {
    console.error('Error processing search:', error);
    
    // Check if it's an API key error
    if (error instanceof Error && error.message.includes('API key')) {
      return Response.json({ error: 'Invalid OpenAI API key' }, { status: 401 });
    }
    
    return Response.json({ error: 'Failed to process search query' }, { status: 500 });
  }
}