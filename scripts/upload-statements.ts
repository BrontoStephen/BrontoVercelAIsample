import * as fs from 'fs';
import * as path from 'path';

// Using fetch API (available in Node 18+)

interface StatementMapping {
    project_id: string;
    version: string;
    repo_url: string;
    statements: Array<{
        stmt_id: string;
        file: string;
        line: number;
        message: string;
        level?: string;
    }>;
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

    const region = process.env.BRONTO_REGION || 'EU';
    const apiKey = process.env.BRONTO_API_KEY;

    if (!apiKey) {
        console.error('❌ BRONTO_API_KEY environment variable is missing.');
        process.exit(1);
    }

    const baseUrl = region === 'EU'
        ? 'https://api.eu.bronto.io'
        : 'https://api.us.bronto.io';

    console.log(`Uploading ${statements.statements.length} statements to ${baseUrl}...`);

    try {
        const response = await fetch(`${baseUrl}/statements`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-BRONTO-API-KEY': apiKey
            },
            body: JSON.stringify(statements)
        });

        if (!response.ok) {
            throw new Error(`Failed to upload statements: ${response.status} ${response.statusText} - ${await response.text()}`);
        }

        const result = await response.json();
        console.log('✅ Statement upload successful:');
        console.log(`   Created:  ${result.created ?? 0} statements`);
        console.log(`   Modified: ${result.modified ?? 0} statements`);
        console.log(`   Deleted:  ${result.deleted ?? 0} statements`);

    } catch (error: any) {
        console.error(`❌ Error uploading statements: ${error.message}`);
        process.exit(1);
    }
}

uploadToBronto().catch(err => {
    console.error(err);
    process.exit(1);
});
