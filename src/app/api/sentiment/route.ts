import { NextResponse } from 'next/server';

// Sentiment classification is not available during the beta.
export async function POST() {
  return NextResponse.json(
    { error: 'This feature is unavailable during the beta.' },
    { status: 410 },
  );
}
