import { BrontoLogger } from '@/lib/bronto-logger';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    BrontoLogger.error('Simulated API Route Error', {
        endpoint: '/api/broken',
        method: 'GET',
        timestamp: new Date().toISOString()
    });

    return NextResponse.json(
        { error: 'Simulated Internal Server Error' },
        { status: 500 }
    );
}
