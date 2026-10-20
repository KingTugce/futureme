
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');

  if (!tokenHash) {
    return NextResponse.redirect(
      new URL('/auth?error=invalid_link', request.url)
    );
  }

  const supabase = supabaseServer();

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'email',
  });

  if (error) {
    return NextResponse.redirect(
      new URL('/auth?error=verification_failed', request.url)
    );
  }

  return NextResponse.redirect(
    new URL('/journal', request.url)
  );
}
