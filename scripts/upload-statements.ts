import * as fs from 'fs';
import * as path from 'path';

// Using fetch API (available in Node 18+)

interface StatementMapping {
    project_id: string;
    version: string;
    repo_url: string;
    statements: Array<{
        id: string; // Changed from stmt_id to id
        file: string;
        line: number;
        message: string;
        level?: string;
    }>;
}

const region = process.env.BRONTO_REGION || 'EU';
const apiKey = process.env.BRONTO_API_KEY;

const ingestionUrl = region === 'EU'
    ? 'https://ingestion.eu.bronto.io/v1/logs'
    : 'https://ingestion.us.bronto.io/v1/logs';

const apiBaseUrl = region === 'EU'
    ? 'https://api.eu.bronto.io'
    : 'https://api.us.bronto.io';

async function sendLogToBronto(level: string, message: string, attributes: Record<string, any> = {}) {
    if (!apiKey) return;

    const logRecord = {
        resourceLogs: [{
            resource: {
                attributes: [
                    { key: 'service.name', value: { stringValue: 'bronto-upload-tool' } },
                    { key: 'deployment.environment', value: { stringValue: 'build' } }
                ]
            },
            scopeLogs: [{
                logRecords: [{
                    timeUnixNano: String(Date.now() * 1000000),
                    severityText: level.toUpperCase(),
                    body: { stringValue: message },
                    attributes: Object.entries(attributes).map(([key, value]) => ({
                        key,
                        value: typeof value === 'number' ? { doubleValue: value } : { stringValue: String(value) }
                    }))
                }]
            }]
        }]
    };

    try {
        await fetch(ingestionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-BRONTO-API-KEY': apiKey
            },
            body: JSON.stringify(logRecord)
        });
    } catch (e) {
        console.warn('⚠️ Failed to send log to Bronto ingestion:', e);
    }
}

async function uploadToBronto() {
    const statementsPath = path.join(process.cwd(), 'dist', 'statement-ids.json');

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
        console.error('❌ BRONTO_API_KEY environment variable is missing.');
        process.exit(1);
    }

    const uploadUrl = `${apiBaseUrl}/statements`;
    const payload = JSON.stringify(statements);
    const headers = {
        'Content-Type': 'application/json',
        'X-BRONTO-API-KEY': apiKey
    };

    // Log the RAW message and headers as requested
    await sendLogToBronto('debug', 'Raw API request details', {
        targetUrl: uploadUrl,
        method: 'POST',
        headers: JSON.stringify(headers),
        rawPayload: payload
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
            await sendLogToBronto('error', 'Statement upload failed', {
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

        await sendLogToBronto('info', 'Statement upload completed successfully', {
            createdCount: result.created ?? 0,
            modifiedCount: result.modified ?? 0,
            deletedCount: result.deleted ?? 0,
            targetUrl: uploadUrl
        });

    } catch (error: any) {
        console.error(`❌ Error uploading statements: ${error.message}`);
        await sendLogToBronto('error', 'Execution error during statement upload', {
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
