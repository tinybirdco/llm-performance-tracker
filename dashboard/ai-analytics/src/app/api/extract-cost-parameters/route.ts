// src/app/api/extract-cost-parameters/route.ts
import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fetchAvailableDimensions, isAllowedTinybirdApiUrl } from '@/lib/dimensions';
import { extractDatesFromQuery } from '@/lib/dateUtils';
import { generateRandomChatId, hashApiKeyUser, wrapModelWithTinybird } from '@/lib/tinybird-wrapper';

const MAX_QUERY_LENGTH = 1000;

// Update the POST function to properly map meta with data
export async function POST(req: Request) {
  try {
    const { query, apiKey } = await req.json();
    const token = req.headers.get('x-custom-tinybird-token');
    const apiUrl = req.headers.get('x-custom-tinybird-api-url');

    if (apiUrl && !isAllowedTinybirdApiUrl(apiUrl)) {
      return NextResponse.json({ error: 'Invalid Tinybird API URL' }, { status: 400 });
    }

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    if (typeof query !== 'string' || query.length > MAX_QUERY_LENGTH) {
      return NextResponse.json({ error: `Query must be a string of at most ${MAX_QUERY_LENGTH} characters` }, { status: 400 });
    }
    
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key is required' }, { status: 400 });
    }
    
    // Extract dates using our new function
    let { start_date, end_date } = extractDatesFromQuery(query);
    
    // Fetch pipe definition and available dimensions in parallel
    const [pipeDefinition, availableDimensions] = await Promise.all([
      fetchPipeDefinition(token, apiUrl),
      fetchAvailableDimensions(token, apiUrl)
    ]);
    
    // Extract dimension values for the system prompt
    const dimensionValues: Record<string, { type: string, values: string[] }> = {};
    
    // Map meta with data for a more structured representation
    if (availableDimensions && availableDimensions.meta && availableDimensions.data && availableDimensions.data.length > 0) {
      const metaInfo = availableDimensions.meta;
      const dataValues = availableDimensions.data[0];
      
      // Create a structured object with meta information and data values
      metaInfo.forEach((meta: { name: string, type: string }) => {
        dimensionValues[meta.name] = {
          type: meta.type,
          values: dataValues[meta.name] || []
        };
      });
    }
    
    console.log('Structured dimension values:', dimensionValues);
    
    // Update system prompt to include formatted timestamp
    const systemPromptText = `
      You are a parameter extractor for an LLM cost calculator. Extract parameters from natural language queries about AI model cost predictions.
      
      Available dimensions and unique values:
      ${availableDimensions?.meta?.map((meta: { name: string, type: string }) => {
        const name = meta.name;
        const values = dimensionValues[name]?.values || [];
        return `- ${name.charAt(0).toUpperCase() + name.slice(1)}: ${JSON.stringify(values)}`;
      }).join('\n  ') || ''}

      Look for phrases like "filter by", "for", "in", "with", etc. to identify filtering parameters, guess the parameter name based on the available dimensions. Fix typos when necessary.
    `;
    console.log(systemPromptText);

    const costParametersSchema = z.object({
      promptTokenCost: z.number().nullable().optional(),
      completionTokenCost: z.number().nullable().optional(),
      discount: z.number().default(0).optional(),
      timeframe: z.string().default('last month').optional(),
      volumeChange: z.number().default(0).optional(),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      group_by: z.string().optional(),
      model: z.enum((availableDimensions?.data?.[0]?.model || ['gpt-4']) as [string, ...string[]]).optional(),
      provider: z.enum((availableDimensions?.data?.[0]?.provider || ['openai']) as [string, ...string[]]).optional(),
      environment: z.enum((availableDimensions?.data?.[0]?.environment || ['production']) as [string, ...string[]]).optional(),
      organization: z.enum((availableDimensions?.data?.[0]?.organizations || ['']) as [string, ...string[]]).optional(),
      project: z.enum((availableDimensions?.data?.[0]?.project || ['']) as [string, ...string[]]).optional(),
      user: z.string().optional()
    });
    type CostParameters = z.infer<typeof costParametersSchema>;

    const openai = createOpenAI({ apiKey: apiKey })
    const wrappedOpenAI = wrapModelWithTinybird(
      openai('gpt-3.5-turbo'),
      process.env.NEXT_PUBLIC_TINYBIRD_API_URL!,
      process.env.TINYBIRD_EVENTS_TOKEN,
      {
        event: 'ai_cost_calculator',
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
      schema: costParametersSchema,
      prompt: query,
      systemPrompt: systemPromptText,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // Type assertion to handle the result object
    const extractedParams = result.object as CostParameters;
    console.log('Extracted parameters:', extractedParams);
    
    // Ensure timeframe is correctly processed
    const timeframe = extractedParams.timeframe || 'last month';
    start_date = extractedParams.start_date || start_date;
    end_date = extractedParams.end_date || end_date;
    
    // Apply defaults for missing parameters
    const processedResult = {
      model: extractedParams.model || null,
      promptTokenCost: extractedParams.promptTokenCost || null,
      completionTokenCost: extractedParams.completionTokenCost || null,
      discount: extractedParams.discount || 0,
      timeframe: timeframe,
      volumeChange: extractedParams.volumeChange || 0,
      start_date: start_date,
      end_date: end_date,
      group_by: extractedParams.group_by || null,
      organization: extractedParams.organization || null,
      project: extractedParams.project || null,
      environment: extractedParams.environment || null,
      provider: extractedParams.provider || null,
      user: extractedParams.user || null,
      pipeDefinition: pipeDefinition,
      availableDimensions: dimensionValues
    };
    
    return NextResponse.json(processedResult);
  } catch (error) {
    console.error('Error processing cost parameters:', error);
    return NextResponse.json({ error: 'Failed to process cost parameters' }, { status: 500 });
  }
}

// Fetch the llm_usage pipe definition
const fetchPipeDefinition = async (token: string | null, apiUrl: string | null) => {
  // The server token only goes to the server URL. A caller-supplied URL needs the caller's own token.
  const TINYBIRD_API_URL = apiUrl || process.env.NEXT_PUBLIC_TINYBIRD_API_URL || 'http://localhost:7181';
  const TINYBIRD_API_KEY = apiUrl ? token : (token || process.env.NEXT_PUBLIC_TINYBIRD_API_KEY);
  
  if (!TINYBIRD_API_KEY) {
    console.error('No Tinybird API key available');
    return null;
  }
  
  try {
    const url = `${TINYBIRD_API_URL}/v0/pipes/llm_usage`;
    console.log('Fetching pipe definition from:', url);
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TINYBIRD_API_KEY}`,
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Error fetching pipe definition:', error);
      throw new Error('Network response was not ok');
    }
    
    const data = await response.json();
    console.log('Pipe definition:', data.content);
    return data.content;
  } catch (error) {
    console.error('Error fetching pipe definition:', error);
    return null;
  }
};