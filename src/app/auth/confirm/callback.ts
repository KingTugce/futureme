import type { EmailOtpType } from '@supabase/supabase-js';

export type AuthCallbackIntent = {
  destination: '/auth/update' | '/journal';
  tokenHash: string;
  type: Extract<EmailOtpType, 'email' | 'recovery' | 'signup'>;
};

export type AuthCallbackParseResult =
  | { ok: true; value: AuthCallbackIntent }
  | { ok: false };

const destinations = {
  email: '/journal',
  recovery: '/auth/update',
  signup: '/journal',
} as const;

function singleValue(searchParams: URLSearchParams, name: string) {
  const values = searchParams.getAll(name);
  if (values.length > 1) return { ok: false as const };
  return { ok: true as const, value: values[0] ?? null };
}

export function parseAuthCallback(
  searchParams: URLSearchParams,
): AuthCallbackParseResult {
  const tokenParam = singleValue(searchParams, 'token_hash');
  const typeParam = singleValue(searchParams, 'type');
  const nextParam = singleValue(searchParams, 'next');

  if (!tokenParam.ok || !typeParam.ok || !nextParam.ok) return { ok: false };

  const tokenHash = tokenParam.value;
  if (
    !tokenHash ||
    tokenHash !== tokenHash.trim() ||
    tokenHash.length > 1024
  ) {
    return { ok: false };
  }

  const type = typeParam.value ?? 'email';
  if (!Object.hasOwn(destinations, type)) return { ok: false };

  const allowedType = type as keyof typeof destinations;
  const destination = destinations[allowedType];
  if (nextParam.value !== null && nextParam.value !== destination) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      destination,
      tokenHash,
      type: allowedType,
    },
  };
}
