import { NextResponse } from 'next/server';

// Legacy sentiment/streak/paywall writes are disabled. Journal saves use /api/entries.
export async function POST() {
  return NextResponse.json(
    { error: 'This feature is unavailable during the beta.' },
    { status: 410 },
  );
}
