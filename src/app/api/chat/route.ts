import { streamText, gateway, convertToModelMessages } from 'ai';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { logWithStatement } from '@/lib/bronto-logger';
import { EvalHeaderSpanProcessor } from '@/instrumentation';

// Allow streaming responses up to 60 seconds (Vercel Pro plan).
// gpt-4-turbo full answers to explanation prompts routinely exceed 30s,
// which truncates the Lambda before onFinish/span.end() fire.
export const maxDuration = 60;

logWithStatement('AI Gateway initialized', {
  mode: 'native-gateway'
});

// Extract human-readable text from a UIMessage's parts/content. Used to shape
// OTel GenAI message events that carry the actual prompt/response content.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractMessageText(m: any): string {
  if (!m) return '';
  if (typeof m.content === 'string') return m.content;
  const parts = Array.isArray(m.parts) ? m.parts : Array.isArray(m.content) ? m.content : [];
  return parts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((p: any) => p && (p.type === 'text' || typeof p.text === 'string'))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((p: any) => p.text ?? p.content ?? '')
    .join('');
}

// Reshape Vercel UI messages into the structure prescribed by OTel GenAI
// content conventions: { role, content: [{ type, content }] }.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toGenAiMessages(uiMessages: any[]): Array<{ role: string; content: Array<{ type: string; content: string }> }> {
  if (!Array.isArray(uiMessages)) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return uiMessages.map((m: any) => ({
    role: String(m?.role ?? 'user'),
    content: [{ type: 'text', content: extractMessageText(m) }],
  }));
}

export async function POST(req: Request) {
  const { messages } = await req.json();

  const evalRunId = req.headers.get('x-eval-run-id') ?? undefined;
  const evalCaseId = req.headers.get('x-eval-case-id') ?? undefined;

  const tracer = trace.getTracer('vercel-ai-sdk');

  return await tracer.startActiveSpan('ai.chat.completion', async (span) => {
    try {
      if (evalRunId || evalCaseId) {
        const evalAttrs: Record<string, string> = {};
        if (evalRunId) evalAttrs['$x-eval-run-id'] = evalRunId;
        if (evalCaseId) evalAttrs['$x-eval-case-id'] = evalCaseId;
        span.setAttributes(evalAttrs);
        EvalHeaderSpanProcessor.setEvalAttributes(
          span.spanContext().traceId,
          evalAttrs,
        );
      }

      span.setAttributes({
        'ai.prompt.messages': JSON.stringify(messages),
        'ai.model': 'openai/gpt-4-turbo',
        'ai.operation': 'chat.completion',
      });

      logWithStatement('AI request received', {
        'ai.prompt.messages': messages,
        'ai.model': 'openai/gpt-4-turbo',
        'ai.operation': 'chat.completion',
        ...(evalRunId ? { eval_run_id: evalRunId } : {}),
        ...(evalCaseId ? { eval_case_id: evalCaseId } : {}),
      });

      const result = await streamText({
        model: gateway('openai/gpt-4-turbo'),
        messages: await convertToModelMessages(messages),
        experimental_telemetry: {
          isEnabled: true,
          recordInputs: true,
          recordOutputs: true,
          functionId: 'chat',
          metadata: {
            ...(evalRunId ? { eval_run_id: evalRunId } : {}),
            ...(evalCaseId ? { eval_case_id: evalCaseId } : {}),
          },
        },
        onFinish: async ({ usage, text, finishReason, response }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const u = usage as any;
          const promptTokens = u.inputTokens || 0;
          const completionTokens = u.outputTokens || 0;
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

          const evalTags = {
            ...(evalRunId ? { eval_run_id: evalRunId } : {}),
            ...(evalCaseId ? { eval_case_id: evalCaseId } : {}),
          };

          // Flavor 1: gen_ai.* fields inlined onto the existing completion log.
          // One log per request; once Bronto's log parser surfaces nested JSON
          // keys, these become typed attributes ($gen_ai.usage.input_tokens, ...).
          logWithStatement('AI request completed', {
            aiUsagePromptTokens: promptTokens,
            aiUsageCompletionTokens: completionTokens,
            aiUsageTotalTokens: totalTokens,
            aiCostPrompt: promptCost,
            aiCostCompletion: completionCost,
            aiCostTotal: totalCost,
            ...evalTags,
            ...(evalRunId || evalCaseId ? { 'ai.output.text': text } : {}),
            // OTel GenAI semantic-convention metadata
            'gen_ai.system': 'gateway',
            'gen_ai.operation.name': 'chat',
            'gen_ai.request.model': 'openai/gpt-4-turbo',
            'gen_ai.response.model': response?.modelId,
            'gen_ai.response.id': response?.id,
            'gen_ai.response.finish_reasons': [finishReason],
            'gen_ai.usage.input_tokens': promptTokens,
            'gen_ai.usage.output_tokens': completionTokens,
            // Content as flat fields (per OTel GenAI content-on-span fallback)
            'gen_ai.input.messages': JSON.stringify(toGenAiMessages(messages)),
            'gen_ai.output.messages': JSON.stringify([{
              role: 'assistant',
              content: [{ type: 'text', content: text }],
              finish_reason: finishReason,
            }]),
          });

          // Flavor 2: separate OTel GenAI message events — one per user/system
          // input message plus one for the assistant's response. Closer to the
          // OTel Events API shape so per-message filtering/sampling stays
          // possible if Bronto ever splits content from metadata.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const inputMessages: any[] = Array.isArray(messages) ? messages : [];
          for (const m of inputMessages) {
            const role = String(m?.role ?? '').toLowerCase();
            if (role !== 'user' && role !== 'system') continue;
            logWithStatement(`gen_ai.${role}.message`, {
              'gen_ai.system': 'gateway',
              'gen_ai.message.role': role,
              'gen_ai.message.content': extractMessageText(m),
              ...evalTags,
            });
          }
          logWithStatement('gen_ai.assistant.message', {
            'gen_ai.system': 'gateway',
            'gen_ai.message.role': 'assistant',
            'gen_ai.message.content': text,
            'gen_ai.message.finish_reason': finishReason,
            ...evalTags,
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


      return result.toUIMessageStreamResponse();

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
