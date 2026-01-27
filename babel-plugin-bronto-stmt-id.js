const {
    createHash
} = require('crypto');
const nodePath = require('path');
module.exports = function (babel) {
    const {
        types: t
    } = babel;
    const statements = new Map();
    return {
        name: "bronto-statement-id",
        visitor: {
            CallExpression(path, state) {
                // Failsafe: only run in Vercel environment
                if (process.env.VERCEL !== '1') {
                    return;
                }
                const callee = path.node.callee;

                // Detect logging calls: console.log, logWithStatement, etc.
                if (isLoggingCall(callee)) {
                    const filename = state.file.opts.filename;
                    const line = path.node.loc?.start.line;
                    if (!filename || !line) return;

                    // Generate statement ID
                    const stmtId = generateStatementId(filename, line);

                    // Get the log message (first argument)
                    // Safety check for arguments
                    if (!path.node.arguments || path.node.arguments.length === 0) {
                        return;
                    }
                    const message = getLogMessage(path.node.arguments[0]);

                    // Store metadata
                    statements.set(stmtId, {
                        file: nodePath.relative(process.cwd(), filename),
                        line,
                        message,
                        id: stmtId
                    });

                    // Inject id as attribute
                    injectStatementId(path, stmtId, t);
                }
            }
        },
        post() {
            // Export statements to file after compilation
            if (process.env.BRONTO_EXPORT_STATEMENTS === 'true') {
                exportStatements(statements);
            }
        }
    };
};
function isLoggingCall(callee) {
    // console.log, console.info, etc.
    if (callee.type === 'MemberExpression') {
        if (callee.object.name === 'console') {
            return ['log', 'info', 'warn', 'error', 'debug'].includes(callee.property.name);
        }

        // Custom logger methods: logger.info(), log.error()
        if (['logger', 'log', 'BrontoLogger'].includes(callee.object.name)) {
            return true;
        }
    }

    // Direct function calls: logWithStatement()
    if (callee.type === 'Identifier' && callee.name.includes('log')) {
        return true;
    }
    return false;
}
function generateStatementId(file, line) {
    return require('crypto').createHash('md5').update(`${file}:${line}`).digest('hex').substring(0, 16);
}
function getLogMessage(arg) {
    if (arg.type === 'StringLiteral') {
        return arg.value;
    }
    // Handle TemplateLiteral
    if (arg.type === 'TemplateLiteral') {
        return arg.quasis.map(q => q.value.raw).join('{}');
    }
    return 'unknown';
}
function injectStatementId(path, stmtId, t) {
    // Add stmt_id to the arguments
    const args = path.node.arguments;

    const lastArg = args[args.length - 1];

    if (lastArg && lastArg.type === 'ObjectExpression') {
        // Check if stmt_id already exists to avoid duplicates
        const hasId = lastArg.properties.some(p => p.key && (p.key.name === 'stmt_id' || p.key.name === 'id'));
        if (!hasId) {
            lastArg.properties.push(t.objectProperty(t.identifier('stmt_id'), t.stringLiteral(stmtId)));
        }
    } else {
        // Add new object with stmt_id
        args.push(t.objectExpression([t.objectProperty(t.identifier('stmt_id'), t.stringLiteral(stmtId))]));
    }
}
function exportStatements(statements) {
    const fs = require('fs');
    const output = {
        project_id: process.env.VERCEL_PROJECT_ID || 'prj_DrzflPlaMjCI7OLH9xSoqIJhB8MZ',
        version: process.env.npm_package_version || '1.0.0',
        repo_url: 'https://github.com/BrontoStephen/BrontoVercelAIsample',
        statements: Array.from(statements.values())
    };
    const outputPath = nodePath.join(process.cwd(), 'dist', 'statement-ids.json');
    try {
        fs.mkdirSync(nodePath.dirname(outputPath), {
            recursive: true
        });
        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
        console.log(`✅ Exported ${statements.size} statement IDs to ${outputPath}`);
    } catch (e) {
        console.error('Failed to export statements', e);
    }
}
