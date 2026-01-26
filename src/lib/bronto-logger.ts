import { trace } from '@opentelemetry/api';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface LogOptions {
    level: 'info' | 'error' | 'warn' | 'debug';
    message: string;
    attributes?: Record<string, any>;
    stmt_id?: string;
}

export class BrontoLogger {

    static log(level: LogOptions['level'], message: string, ...args: any[]) {
        let attributes: Record<string, any> = {};
        let stmtId: string | undefined;

        // The Babel plugin might inject stmt_id or id by merging it into the last object arg,
        // or by appending a new object { id: ... } as the last arg.
        const lastArg = args.length > 0 ? args[args.length - 1] : undefined;

        if (lastArg && typeof lastArg === 'object' && (lastArg.stmt_id || lastArg.id)) {
            stmtId = lastArg.stmt_id || lastArg.id;
            attributes = { ...lastArg };
            delete attributes.stmt_id;
            delete attributes.id;

            // If the user provided attributes as a separate previous argument, merge them
            if (args.length > 1 && typeof args[0] === 'object') {
                attributes = { ...args[0], ...attributes };
            }
        } else if (args.length > 0 && typeof args[0] === 'object') {
            attributes = { ...args[0] };
        }

        const span = trace.getActiveSpan();

        // Construct structured log entry for Vercel Drain
        const logEntry: any = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...attributes
        };

        if (stmtId) {
            logEntry['stmt_id'] = stmtId;
        }

        if (span) {
            const context = span.spanContext();
            logEntry['trace.id'] = context.traceId;
            logEntry['span.id'] = context.spanId;
        }

        // Standard console output is captured by Vercel Log Drains
        const consoleMethod = (console as any)[level] || console.log;
        consoleMethod(JSON.stringify(logEntry));
    }

    static info(message: string, ...args: any[]) {
        this.log('info', message, ...args);
    }

    static error(message: string, ...args: any[]) {
        this.log('error', message, ...args);
    }

    static warn(message: string, ...args: any[]) {
        this.log('warn', message, ...args);
    }

    static debug(message: string, ...args: any[]) {
        this.log('debug', message, ...args);
    }
}

export function logWithStatement(message: string, ...args: any[]) {
    BrontoLogger.info(message, ...args);
}
