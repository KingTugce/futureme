import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { parseAuthCallback } from './callback';

function privateRedirect(request: NextRequest, destination: string) {
  const response = NextResponse.redirect(
    new URL(destination, request.url),
    303,
  );
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return response;
}

export async function GET(request: NextRequest) {
  const parsed = parseAuthCallback(request.nextUrl.searchParams);
  if (!parsed.ok) return privateRedirect(request, '/auth?error=invalid_link');

  try {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: parsed.value.tokenHash,
      type: parsed.value.type,
    });

    if (error) {
      return privateRedirect(request, '/auth?error=verification_failed');
    }

    return privateRedirect(request, parsed.value.destination);
  } catch {
    return privateRedirect(request, '/auth?error=verification_failed');
  }
}
