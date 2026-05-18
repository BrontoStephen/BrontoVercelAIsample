import { registerOTel } from '@vercel/otel';
import type { Context } from '@opentelemetry/api';
import type { Span, SpanProcessor, ReadableSpan } from '@opentelemetry/sdk-trace-base';

type EvalAttrs = Record<string, string>;
const EVAL_ATTR_TTL_MS = 5 * 60 * 1000;

export class EvalHeaderSpanProcessor implements SpanProcessor {
    private static store = new Map<string, { attrs: EvalAttrs; expiresAt: number }>();

    static setEvalAttributes(traceId: string, attrs: EvalAttrs): void {
        if (!traceId || Object.keys(attrs).length === 0) return;
        EvalHeaderSpanProcessor.store.set(traceId, {
            attrs,
            expiresAt: Date.now() + EVAL_ATTR_TTL_MS,
        });
        EvalHeaderSpanProcessor.prune();
    }

    private static prune(): void {
        const now = Date.now();
        EvalHeaderSpanProcessor.store.forEach((entry, traceId) => {
            if (entry.expiresAt < now) EvalHeaderSpanProcessor.store.delete(traceId);
        });
    }

    onStart(span: Span, _parentContext: Context): void {
        const traceId = span.spanContext().traceId;
        const entry = EvalHeaderSpanProcessor.store.get(traceId);
        if (entry && entry.expiresAt >= Date.now()) {
            span.setAttributes(entry.attrs);
        }
    }

    onEnd(_span: ReadableSpan): void {}
    async forceFlush(): Promise<void> {}
    async shutdown(): Promise<void> {}
}

export async function register() {
    registerOTel({
        serviceName: 'vercel-ai-demo',
        spanProcessors: [new EvalHeaderSpanProcessor(), 'auto'],
    });
}
