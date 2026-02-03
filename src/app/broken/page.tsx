'use client';

import { useState } from 'react';
import { triggerServerError } from './actions';
import { logWithStatement } from '@/lib/bronto-logger';

export default function BrokenPage() {
    const [status, setStatus] = useState<string>('Ready');

    const handleClientError = () => {
        try {
            setStatus('Triggering Client Error...');
            // We want to log the error *before* throwing or just log it as an error event
            // But usually we want to see if the statement ID is attached to the log call site.
            logWithStatement('Simulated Client-Side Error Event', {
                component: 'BrokenPage',
                type: 'client_click'
            });
            throw new Error('This is a simulated Client-Side error');
        } catch (e) {
            console.error('Caught client error:', e);
            setStatus('Client Error Triggered (Check Console)');
        }
    };

    const handleServerActionError = async () => {
        try {
            setStatus('Triggering Server Action Error...');
            await triggerServerError();
        } catch (e) {
            console.error('Caught server action error:', e);
            setStatus('Server Action Error Triggered (Check Server Logs)');
        }
    };

    const handleApiError = async () => {
        try {
            setStatus('Triggering API Error...');
            const res = await fetch('/api/broken');
            if (!res.ok) {
                setStatus(`API Error Triggered: ${res.status} (Check Server Logs)`);
            } else {
                setStatus('API Call Success (Unexpected)');
            }
        } catch (e) {
            console.error('Caught API fetch error:', e);
            setStatus('API Fetch Error (Check Console)');
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-8 p-8 font-[family-name:var(--font-geist-sans)]">
            <h1 className="text-3xl font-bold">Broken Page Debugger</h1>
            <p className="text-gray-500">Status: {status}</p>

            <div className="flex flex-col gap-4">
                <button
                    onClick={handleClientError}
                    className="px-6 py-3 text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                >
                    Trigger Client Error
                </button>

                <button
                    onClick={handleServerActionError}
                    className="px-6 py-3 text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors"
                >
                    Trigger Server Action Error
                </button>

                <button
                    onClick={handleApiError}
                    className="px-6 py-3 text-white bg-yellow-600 rounded-lg hover:bg-yellow-700 transition-colors"
                >
                    Trigger API Route Error
                </button>
            </div>

            <p className="max-w-md text-sm text-center text-gray-500 mt-8">
                Note: Clicking these buttons will generate logs with Statement IDs.
                You should see these in your server output or Vercel log drains.
            </p>
        </div>
    );
}
