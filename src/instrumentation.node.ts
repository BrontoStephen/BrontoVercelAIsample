import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';

const sdk = new NodeSDK({
    resource: resourceFromAttributes({
        [SemanticResourceAttributes.SERVICE_NAME]: 'vercel-ai-demo',
    }),
    traceExporter: new OTLPTraceExporter({
        url: 'https://ingestion.eu.bronto.io/v1/traces',
        headers: {
            'x-bronto-api-key': process.env.BRONTO_API_KEY || '',
        },
    }),
    logRecordProcessor: new SimpleLogRecordProcessor(
        new OTLPLogExporter({
            url: 'https://ingestion.eu.bronto.io/v1/logs',
            headers: {
                'x-bronto-api-key': process.env.BRONTO_API_KEY || '',
            },
        })
    ),
    instrumentations: [],
});

sdk.start();
