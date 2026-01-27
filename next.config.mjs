/** @type {import('next').NextConfig} */
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        instrumentationHook: true,
    },
    webpack: (config, { isServer }) => {
        // Apply Babel only to API routes and Lib folder to support statement ID injection
        // while letting the rest of the app (like layout.tsx) use SWC for font features.
        // We only enable this in Vercel environment to prevent local/production ID mismatches.
        const isVercel = process.env.VERCEL === '1';

        if (isVercel) {
            console.log('🛡️  Bronto: Vercel environment detected. Enabling statement ID injection.');
            config.module.rules.push({
                test: /\.(ts|tsx|js|jsx)$/,
                include: [
                    path.resolve(__dirname, 'src/app/api'),
                    path.resolve(__dirname, 'src/lib')
                ],
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['next/babel'],
                        plugins: [
                            './babel-plugin-bronto-stmt-id.js'
                        ]
                    }
                }
            });
        } else {
            console.log('🛡️  Bronto: Local environment or non-Vercel build. Skipping statement ID injection.');
        }
        return config;
    }
};

export default nextConfig;
