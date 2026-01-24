import { trace } from '@opentelemetry/api';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface LogOptions {
    level: 'info' | 'error' | 'warn' | 'debug';
    message: string;
    attributes?: Record<string, any>;
    stmt_id?: string; // Injected by Babel plugin
}

// Helper to look for stmt_id in the last argument if it was injected as a separate object
// function extractStmtId(args: any[]): string | undefined {
//     const lastArg = args[args.length - 1];
//     if (lastArg && typeof lastArg === 'object' && 'stmt_id' in lastArg) {
//         return lastArg.stmt_id;
//     }
//     return undefined;
// }


export class BrontoLogger {

    static log(level: LogOptions['level'], message: string, ...args: any[]) {
        // The Babel plugin injects stmt_id into the last argument if it's an object, 
        // or appends a new object { stmt_id: ... }

        let attributes: Record<string, any> = {};
        let stmtId: string | undefined;

        // Check if the last arg has stmt_id
        const potentiallyInjected = args[args.length - 1];
        if (potentiallyInjected && typeof potentiallyInjected === 'object' && potentiallyInjected.stmt_id) {
            stmtId = potentiallyInjected.stmt_id;
            // If it was just the injected object (only has stmt_id), we might not want to treat it as user attributes
            // But if the user passed attributes AND it got injected there, we use it.
            attributes = { ...potentiallyInjected };
            delete attributes.stmt_id; // Remove from attributes effectively, or keep it. Let's keep it as a distinct field.
        } else if (args.length > 0 && typeof args[0] === 'object') {
            // Sometimes users might pass (message, attributes)
            attributes = args[0];
        }


        const span = trace.getActiveSpan();

        // Construct log entry
        const logEntry: any = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...attributes
        };

        if (stmtId) {
            logEntry['bronto.statement.id'] = stmtId;
        }

        if (span) {
            logEntry['trace.id'] = span.spanContext().traceId;
            logEntry['span.id'] = span.spanContext().spanId;
        }

        // In a real app, you might want to send this to a log collector.
        // For now, we print to console. 
        // We should be careful not to trigger the babel plugin recursively if we use console.log here.
        // The babel plugin checks for 'console.log' and 'BrontoLogger.*'.
        // To avoid infinite recursion or double injection if we used console.log inside BrontoLogger which is also instrumented:
        // The plugin targets 'BrontoLogger.info' calls in USER code. 
        // Inside this file, we are defining BrontoLogger.

        // Use proper console method
        const consoleMethod = console[level] || console.log;
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
