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

/**
 * Check which statement IDs from a list are missing from Bronto
 */
async function checkMissingStatements(statementIds: string[]) {
    if (!apiKey) {
        console.error('❌ BRONTO_API_KEY environment variable is missing.');
        process.exit(1);
    }

    const headers = {
        'X-BRONTO-API-KEY': apiKey
    };

    console.log(`Checking ${statementIds.length} statement IDs in ${region} region...\n`);

    const results = {
        found: [] as string[],
        missing: [] as string[],
        errors: [] as { id: string, error: string }[]
    };

    for (const id of statementIds) {
        const url = `${apiBaseUrl}/statements/${id}`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: headers
            });

            if (response.ok) {
                const data = await response.json();
                console.log(`✅ [FOUND]   ${id} - ${data.file}:${data.line} - "${data.message}"`);
                results.found.push(id);
            } else if (response.status === 404) {
                console.log(`❌ [MISSING] ${id}`);
                results.missing.push(id);
            } else {
                const errorText = await response.text();
                console.log(`⚠️ [ERROR]   ${id} - Status ${response.status}: ${errorText}`);
                results.errors.push({ id, error: `${response.status}: ${errorText}` });
            }
        } catch (error: any) {
            console.log(`⚠️ [ERROR]   ${id} - Fetch failed: ${error.message}`);
            results.errors.push({ id, error: error.message });
        }
    }

    console.log('\n--- Check Summary ---');
    console.log(`Region:   ${region}`);
    console.log(`Total:    ${statementIds.length}`);
    console.log(`Found:    ${results.found.length}`);
    console.log(`Missing:  ${results.missing.length}`);
    if (results.errors.length > 0) {
        console.log(`Errors:   ${results.errors.length}`);
    }
    console.log('---------------------\n');

    if (results.missing.length > 0) {
        console.log('Missing statement IDs:');
        results.missing.forEach(id => console.log(`  - ${id}`));
        console.log('');
    }

    return results;
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('Usage:');
    console.log('  npx ts-node scripts/check-missing-statements.ts <statement_id_1> [statement_id_2] [...]');
    console.log('  npx ts-node scripts/check-missing-statements.ts 5c2e003a488c8168 f50fc3f8eaa6a8a6');
    console.log('\nOr check IDs from statement-ids.json:');
    console.log('  npx ts-node scripts/check-missing-statements.ts --from-file');
    process.exit(1);
}

if (args[0] === '--from-file') {
    const statementsPath = path.join(process.cwd(), 'dist', 'statement-ids.json');

    if (!fs.existsSync(statementsPath)) {
        console.error(`❌ Statement file not found at ${statementsPath}`);
        process.exit(1);
    }

    const fileContent = fs.readFileSync(statementsPath, 'utf-8');
    const mapping: StatementMapping = JSON.parse(fileContent);
    const ids = mapping.statements.map(s => s.id);

    checkMissingStatements(ids).catch(err => {
        console.error(err);
        process.exit(1);
    });
} else {
    checkMissingStatements(args).catch(err => {
        console.error(err);
        process.exit(1);
    });
}
