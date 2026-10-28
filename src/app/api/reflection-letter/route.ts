import { NextResponse } from 'next/server';

// Monthly reflection letters are not available during the beta.
export async function POST() {
  return NextResponse.json(
    { error: 'This feature is unavailable during the beta.' },
    { status: 410 },
  );
}
