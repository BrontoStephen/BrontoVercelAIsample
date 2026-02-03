'use server';

import { BrontoLogger as Logger } from '@/lib/bronto-logger';

export async function triggerServerError() {
    Logger.error('Simulated Server Action Error', {
        component: 'BrokenPage',
        action: 'triggerServerError',
        timestamp: new Date().toISOString()
    });

    throw new Error('This is a simulated Server Action error');
}
