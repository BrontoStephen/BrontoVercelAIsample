import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { logWithStatement } from '@/lib/bronto-logger';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const tracer = trace.getTracer('vercel-ai-sdk');

  return await tracer.startActiveSpan('ai.chat.completion', async (span) => {
    try {
      span.setAttributes({
        'ai.prompt.messages': JSON.stringify(messages), // Stringify for attribute safety if complex object
        'ai.model': 'gpt-4-turbo',
        'ai.operation': 'chat.completion',
      });

      logWithStatement('AI request received', {
        'ai.prompt.messages': messages,
        'ai.model': 'gpt-4-turbo',
        'ai.operation': 'chat.completion',
      });

      const result = await streamText({
        model: openai('gpt-4-turbo'),
        messages,
        onFinish: async ({ usage }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const u = usage as any;
          const promptTokens = u.promptTokens || 0;
          const completionTokens = u.completionTokens || 0;
          const totalTokens = u.totalTokens || 0;

          const promptCostRate = 0.03; // $0.03 per 1k tokens
          const completionCostRate = 0.06; // $0.06 per 1k tokens

          const promptCost = (promptTokens / 1000) * promptCostRate;
          const completionCost = (completionTokens / 1000) * completionCostRate;
          const totalCost = promptCost + completionCost;

          span.setAttributes({
            'ai.usage.prompt_tokens': promptTokens,
            'ai.usage.completion_tokens': completionTokens,
            'ai.usage.total_tokens': totalTokens,
            'ai.cost.prompt': promptCost,
            'ai.cost.completion': completionCost,
            'ai.cost.total': totalCost,
            'ai.cost.rate.prompt': promptCostRate,
            'ai.cost.rate.completion': completionCostRate,
          });

          // End the span successfully
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();

          logWithStatement('AI request completed', {
            'ai.usage.total_tokens': totalTokens,
            'ai.cost.total': totalCost,
            'ai.cost.prompt': promptCost,
            'ai.cost.completion': completionCost,
          });
        },
        onError: async ({ error }) => {
          span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
          span.recordException(error instanceof Error ? error : new Error(String(error)));
          span.end();

          logWithStatement('AI request failed (stream)', {
            'error.message': error instanceof Error ? error.message : String(error)
          });
        }
      });


      return result.toTextStreamResponse();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);

      logWithStatement('AI request failed', {
        'error.message': error.message,
        'error.stack': error.stack
      });
      span.end();
      throw error;
    }
  });
}
