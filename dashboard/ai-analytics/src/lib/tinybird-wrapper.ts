import type { LanguageModelV1 } from '@ai-sdk/provider';

type TinybirdConfig = {
  event?: string;
  organization?: string;
  project?: string;
  environment?: string;
  user?: string;
  chatId?: string;
  systemPrompt?: string;
};

export function wrapModelWithTinybird(
  model: LanguageModelV1,
  tinybirdApiUrl: string,
  tinybirdToken: string | undefined,
  config: TinybirdConfig = {}
) {
  // No append token configured: skip logging instead of falling back to another token
  if (!tinybirdToken) return model;

  const originalDoGenerate = model.doGenerate;
  const originalDoStream = model.doStream;

  const logToTinybird = async (
    messageId: string,
    startTime: Date,
    status: 'success' | 'error',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result?: any,
    error?: Error
  ) => {
    const endTime = new Date();
    const duration = (endTime.getTime() - startTime.getTime()) / 1000;

    // Debug log to help troubleshoot
    console.log('Tinybird wrapper args:', JSON.stringify(args[0], null, 2));
    console.log('Tinybird wrapper result:', JSON.stringify(result, null, 2));

    // Extract messages from args
    let messages = [];
    
    // First, check if config has systemPrompt property and add it to messages
    if (config.systemPrompt) {
      messages.push({
        role: 'system',
        content: String(config.systemPrompt)
      });
    }
    
    // Check if args[0] has messages property (Vercel AI SDK format)
    if (args[0]?.messages && Array.isArray(args[0].messages)) {
      // Use the messages directly from the Vercel AI SDK
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userMessages = args[0].messages.map((m: { role: string; content: string | any[] | { text: string } }) => {
        // Handle content that might be an array of objects with type and text
        let content = m.content;
        if (Array.isArray(content)) {
          // Extract text from content array
          content = content
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((item: any) => item.type === 'text')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((item: any) => item.text)
            .join(' ');
        } else if (typeof content === 'object' && content !== null && 'text' in content) {
          // Handle content that is an object with a text property
          content = content.text;
        }
        return {
          role: String(m.role),
          content: String(content)
        };
      });
      
      // Add user messages, skipping system messages if we already have one from config
      userMessages.forEach((m: { role: string; content: string }) => {
        if (m.role !== 'system' || messages.length === 0) {
          messages.push(m);
        }
      });
    } 
    // Check if args[0] has prompt property (legacy format)
    else if (args[0]?.prompt) {
      // Handle prompt that might be an array of objects with type and text
      let promptContent = args[0].prompt;
      if (Array.isArray(promptContent)) {
        // Extract text from prompt array
        promptContent = promptContent
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((item: any) => item.type === 'text')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((item: any) => item.text)
          .join(' ');
      } else if (typeof promptContent === 'object' && promptContent !== null && 'text' in promptContent) {
        // Handle prompt that is an object with a text property
        promptContent = promptContent.text;
      }
      messages.push({
        role: 'user',
        content: String(promptContent)
      });
    }
    
    // Add the assistant's response if available
    if (status === 'success' && result?.text) {
      messages.push({
        role: 'assistant',
        content: String(result.text)
      });
    }
    
    // Check if result has rawCall property with rawPrompt (Vercel AI SDK format)
    if (status === 'success' && result?.rawCall?.rawPrompt && Array.isArray(result.rawCall.rawPrompt)) {
      // Use the rawPrompt from the result, but preserve our system message if we have one
      const systemMessage = messages.find((m: { role: string; content: string }) => m.role === 'system');
      messages = result.rawCall.rawPrompt.map((m: { role: string; content: string }) => ({
        role: String(m.role),
        content: String(m.content)
      }));
      
      // If we had a system message from config, add it back
      if (systemMessage && !messages.some((m: { role: string; content: string }) => m.role === 'system')) {
        messages.unshift(systemMessage);
      }
      
      // Add the assistant's response if available
      if (result.toolCalls && result.toolCalls.length > 0) {
        const toolCall = result.toolCalls[0];
        if (toolCall.toolName === 'json' && toolCall.args) {
          messages.push({
            role: 'assistant',
            content: `Tool call: ${toolCall.toolName} with args: ${toolCall.args}`
          });
        }
      }
    }

    // Ensure we have at least one message
    if (messages.length === 0) {
      messages = [{ role: 'user', content: 'No message content available' }];
    }

    // Debug log the final messages array
    console.log('Tinybird wrapper final messages:', JSON.stringify(messages, null, 2));

    const event = {
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      message_id: messageId,
      cost: calculateCost(model.modelId || 'unknown', result?.usage),
      model: model.modelId || 'unknown',
      provider: 'openai',
      duration,
      llm_api_duration_ms: duration,
      response: status === 'success' ? {
        id: messageId,
        object: 'chat.completion',
        usage: {
          prompt_tokens: result?.usage?.promptTokens || 0,
          completion_tokens: result?.usage?.completionTokens || 0,
          total_tokens: (result?.usage?.promptTokens || 0) + (result?.usage?.completionTokens || 0),
        },
        choices: [{ message: { content: result?.text ?? '' } }],
      } : undefined,
      messages: messages,
      proxy_metadata: {
        organization: config.organization || '',
        project: config.project || '',
        environment: config.environment || '',
        chat_id: config.chatId || '',
      },
      user: config.user || 'unknown',
      standard_logging_object_status: status,
      standard_logging_object_response_time: duration,
      log_event_type: config.event || 'chat_completion',
      id: messageId,
      call_type: 'completion',
      cache_hit: false,
      ...(status === 'error' && {
        exception: error?.message || 'Unknown error',
        traceback: error?.stack || '',
      }),
    };

    // Send to Tinybird
    fetch(`${tinybirdApiUrl}/v0/events?name=llm_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tinybirdToken}`,
      },
      body: JSON.stringify(event),
    }).catch(console.error);
  };

  model.doGenerate = async function (...args) {
    const startTime = new Date();
    const messageId = crypto.randomUUID();
    
    try {
      const result = await originalDoGenerate.apply(this, args);
      await logToTinybird(messageId, startTime, 'success', args, result);
      return result;
    } catch (error) {
      await logToTinybird(messageId, startTime, 'error', args, undefined, error as Error);
      throw error;
    }
  };

  model.doStream = async function (...args) {
    const startTime = new Date();
    const messageId = crypto.randomUUID();
    
    try {
      const result = await originalDoStream.apply(this, args);
      
      // For streaming, we need to handle the messages differently
      // We'll log the initial request, but won't have the complete response
      await logToTinybird(
        messageId, 
        startTime, 
        'success', 
        args, 
        { text: '', usage: { promptTokens: 0, completionTokens: 0 } }
      );
      
      return result;
    } catch (error) {
      await logToTinybird(messageId, startTime, 'error', args, undefined, error as Error);
      throw error;
    }
  };

  return model;
}

// Function to calculate cost based on model and token usage
function calculateCost(
  modelId: string, 
  usage?: { promptTokens?: number; completionTokens?: number }
): number {
  if (!usage) return 0;
  
  // Default to 0 if no tokens used
  const promptTokens = usage.promptTokens || 0;
  const completionTokens = usage.completionTokens || 0;
  
  // Cost per 1K tokens (in USD)
  // These values are approximate and may need to be updated
  const modelCosts: Record<string, { prompt: number; completion: number }> = {
    'gpt-4o': { prompt: 0.03, completion: 0.06 },
    'gpt-4o-mini': { prompt: 0.015, completion: 0.03 },
    'gpt-4': { prompt: 0.03, completion: 0.06 },
    'gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
    'gpt-4-turbo-preview': { prompt: 0.01, completion: 0.03 },
    'gpt-3.5-turbo': { prompt: 0.0015, completion: 0.002 },
    'gpt-3.5-turbo-16k': { prompt: 0.003, completion: 0.004 },
    'gpt-3.5-turbo-0125': { prompt: 0.0015, completion: 0.002 },
    'gpt-3.5-turbo-1106': { prompt: 0.0015, completion: 0.002 },
    'gpt-3.5-turbo-instruct': { prompt: 0.0015, completion: 0.002 },
    'claude-3-opus': { prompt: 0.015, completion: 0.075 },
    'claude-3-sonnet': { prompt: 0.003, completion: 0.015 },
    'claude-3-haiku': { prompt: 0.00025, completion: 0.00125 },
    'claude-2.1': { prompt: 0.008, completion: 0.024 },
    'claude-2.0': { prompt: 0.008, completion: 0.024 },
    'claude-instant': { prompt: 0.0008, completion: 0.0024 },
    'gemini-pro': { prompt: 0.00025, completion: 0.0005 },
    'gemini-1.5-pro': { prompt: 0.00025, completion: 0.0005 },
    'gemini-1.5-flash': { prompt: 0.00025, completion: 0.0005 },
    'mixtral-8x7b': { prompt: 0.00027, completion: 0.00027 },
    'llama-3-70b': { prompt: 0.0009, completion: 0.0009 },
    'llama-3-8b': { prompt: 0.0002, completion: 0.0002 },
    'llama-2-70b': { prompt: 0.0009, completion: 0.0009 },
    'llama-2-13b': { prompt: 0.0002, completion: 0.0002 },
    'llama-2-7b': { prompt: 0.0002, completion: 0.0002 },
    'mistral-large': { prompt: 0.008, completion: 0.024 },
    'mistral-medium': { prompt: 0.0027, completion: 0.0081 },
    'mistral-small': { prompt: 0.002, completion: 0.006 },
    'unknown': { prompt: 0.001, completion: 0.002 }, // Default fallback
  };
  
  // Get the cost rates for this model, or use the default
  const rates = modelCosts[modelId] || modelCosts['unknown'];
  
  // Calculate total cost
  const promptCost = (promptTokens / 1000) * rates.prompt;
  const completionCost = (completionTokens / 1000) * rates.completion;
  
  return Number((promptCost + completionCost).toFixed(6));
} 

// Function to generate a random chatId
export function generateRandomChatId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `search_${timestamp}_${randomPart}`;
}

// Function to hash the last 10 characters of the API key for user identification
export function hashApiKeyUser(apiKey: string): string {
  // Get the last 10 characters of the API key
  const lastTenChars = apiKey.slice(-10);
  
  // Simple hash function (not cryptographically secure, but sufficient for this purpose)
  let hash = 0;
  for (let i = 0; i < lastTenChars.length; i++) {
    const char = lastTenChars.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Convert to a positive hex string and take first 8 characters
  const positiveHash = Math.abs(hash).toString(16);
  return `user_${positiveHash.substring(0, 8)}`;
}