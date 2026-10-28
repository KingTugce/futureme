import { NextResponse } from 'next/server';

// Historical sentiment data is preserved; the beta does not expose this feature.
export async function GET() {
  return NextResponse.json(
    { error: 'This feature is unavailable during the beta.' },
    { status: 410 },
  );
}
