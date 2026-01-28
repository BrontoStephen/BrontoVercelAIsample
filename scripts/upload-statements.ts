import * as fs from 'fs';
import * as path from 'path';

// Using fetch API (available in Node 18+)

interface StatementMapping {
    project_id: string;
    version: string;
    repo_url: string;
    statements: Array<{
        id: string; // Internal id for the statement
        file: string;
        line: number;
        message: string;
        level?: string;
    }>;
}

const region = process.env.BRONTO_REGION || 'EU';
const apiKey = process.env.BRONTO_API_KEY;

const apiBaseUrl = region === 'EU'
    ? 'https://api.eu.bronto.io'
    : 'https://api.us.bronto.io';

/**
 * Outputs structured JSON to stdout for Vercel Log Drains to capture and forward to Bronto.
 */
function structuredLog(level: string, message: string, attributes: Record<string, any> = {}) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        level: level.toLowerCase(),
        message: message,
        service: 'bronto-upload-tool',
        environment: 'build',
        ...attributes
    };
    console.log(JSON.stringify(logEntry));
}

async function uploadToBronto() {
    const statementsPath = path.join(process.cwd(), 'dist', 'statement-ids.json');

    // Strict Guard: Only run in Vercel environment
    if (process.env.VERCEL !== '1') {
        console.log('🛡️  Bronto: Local environment or non-Vercel build. Skipping statement upload.');
        process.exit(0);
    }

    if (!fs.existsSync(statementsPath)) {
        console.error(`❌ Statement file not found at ${statementsPath}. Run 'npm run export-statements' first.`);
        process.exit(1);
    }

    const fileContent = fs.readFileSync(statementsPath, 'utf-8');
    let statements: StatementMapping;
    try {
        statements = JSON.parse(fileContent);
    } catch (e) {
        console.error('❌ Failed to parse statements file JSON');
        process.exit(1);
    }

    if (!apiKey) {
        structuredLog('error', 'BRONTO_API_KEY environment variable is missing.');
        console.error('❌ BRONTO_API_KEY environment variable is missing.');
        process.exit(1);
    }

    const uploadUrl = `${apiBaseUrl}/statements`;
    const payload = JSON.stringify(statements);
    // Sanitize headers for logging to avoid exposing full API key in plain text if possible,
    // though the user specifically asked for raw headers.
    const headers = {
        'Content-Type': 'application/json',
        'X-BRONTO-API-KEY': apiKey
    };

    structuredLog('info', 'Starting statement upload', {
        statementCount: statements.statements.length,
        targetUrl: uploadUrl,
        projectId: statements.project_id,
        version: statements.version,
        repoUrl: statements.repo_url
    });

    // Log the RAW message and headers as requested for Vercel Log Drain capture
    structuredLog('debug', 'Raw API request details', {
        targetUrl: uploadUrl,
        method: 'POST',
        headers: headers,
        rawPayload: statements // Send as object, structuredLog will stringify
    });

    console.log(`Uploading ${statements.statements.length} statements for project ${statements.project_id} to ${uploadUrl}...`);

    try {
        const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: headers,
            body: payload
        });

        if (!response.ok) {
            const errorText = await response.text();
            structuredLog('error', 'Statement upload failed', {
                status: response.status,
                error: errorText,
                targetUrl: uploadUrl
            });
            throw new Error(`Failed to upload statements: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();
        console.log('✅ Statement upload successful:');
        console.log(`   Created:  ${result.created ?? 0} statements`);
        console.log(`   Modified: ${result.modified ?? 0} statements`);
        console.log(`   Deleted:  ${result.deleted ?? 0} statements`);

        structuredLog('info', 'Statement upload completed successfully', {
            createdCount: result.created ?? 0,
            modifiedCount: result.modified ?? 0,
            deletedCount: result.deleted ?? 0,
            targetUrl: uploadUrl
        });

    } catch (error: any) {
        console.error(`❌ Error uploading statements: ${error.message}`);
        structuredLog('error', 'Execution error during statement upload', {
            exception: error.message,
            targetUrl: uploadUrl
        });
        process.exit(1);
    }
}

uploadToBronto().catch(err => {
    console.error(err);
    process.exit(1);
});
