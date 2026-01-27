import * as fs from 'fs';
import * as path from 'path';

interface StatementMapping {
    project_id: string;
    version: string;
    repo_url: string;
    statements: Array<{
        id: string;
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

async function verifyStatements() {
    const statementsPath = path.join(process.cwd(), 'dist', 'statement-ids.json');

    if (!fs.existsSync(statementsPath)) {
        console.error(`❌ Statement file not found at ${statementsPath}. Run 'npm run export-statements' first.`);
        process.exit(1);
    }

    const fileContent = fs.readFileSync(statementsPath, 'utf-8');
    let mapping: StatementMapping;
    try {
        mapping = JSON.parse(fileContent);
    } catch (e) {
        console.error('❌ Failed to parse statements file JSON');
        process.exit(1);
    }

    if (!apiKey) {
        console.error('❌ BRONTO_API_KEY environment variable is missing.');
        process.exit(1);
    }

    const headers = {
        'X-BRONTO-API-KEY': apiKey
    };

    console.log(`Verifying ${mapping.statements.length} statements for project ${mapping.project_id} in ${region} region...\n`);

    let foundCount = 0;
    let missingCount = 0;
    let errorCount = 0;

    for (const statement of mapping.statements) {
        const url = `${apiBaseUrl}/statements/${statement.id}`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: headers
            });

            if (response.ok) {
                const data = await response.json();
                console.log(`✅ [FOUND]   ${statement.id} - ${statement.file}:${statement.line}`);
                foundCount++;
            } else if (response.status === 404) {
                console.log(`❌ [MISSING] ${statement.id} - ${statement.file}:${statement.line}`);
                missingCount++;
            } else {
                const errorText = await response.text();
                console.log(`⚠️ [ERROR]   ${statement.id} - Status ${response.status}: ${errorText}`);
                errorCount++;
            }
        } catch (error: any) {
            console.log(`⚠️ [ERROR]   ${statement.id} - Fetch failed: ${error.message}`);
            errorCount++;
        }
    }

    console.log('\n--- Verification Summary ---');
    console.log(`Region:   ${region}`);
    console.log(`Total:    ${mapping.statements.length}`);
    console.log(`Found:    ${foundCount}`);
    console.log(`Missing:  ${missingCount}`);
    if (errorCount > 0) {
        console.log(`Errors:   ${errorCount}`);
    }
    console.log('----------------------------\n');

    if (missingCount > 0 || errorCount > 0) {
        process.exit(1);
    }
}

verifyStatements().catch(err => {
    console.error(err);
    process.exit(1);
});
