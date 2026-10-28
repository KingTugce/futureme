export const NEW_PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 256;
export const RESET_REQUEST_CONFIRMATION =
  'If an account exists for that email, we sent password reset instructions.';

export type AuthAction =
  | 'sign-in'
  | 'sign-up'
  | 'reset'
  | 'update'
  | 'sign-out';

export type AuthNotice = {
  kind: 'error' | 'success';
  text: string;
};

type UserIdentity = {
  id?: unknown;
};

type AuthErrorLike = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
};

function errorDetails(error: unknown) {
  if (!error || typeof error !== 'object') {
    return { code: '', message: '', status: 0 };
  }

  const candidate = error as AuthErrorLike;
  return {
    code: typeof candidate.code === 'string' ? candidate.code.toLowerCase() : '',
    message:
      typeof candidate.message === 'string'
        ? candidate.message.toLowerCase()
        : '',
    status: typeof candidate.status === 'number' ? candidate.status : 0,
  };
}

export function normalizeEmail(value: string) {
  return value.trim();
}

export function validateEmail(value: string): string | null {
  const email = normalizeEmail(value);

  if (!email) return 'Enter your email address.';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Enter a valid email address.';
  }

  return null;
}

export function validateNewPassword(password: string): string | null {
  if (!password) return 'Enter a password.';
  if (password.length < NEW_PASSWORD_MIN_LENGTH) {
    return `Use at least ${NEW_PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Use no more than ${PASSWORD_MAX_LENGTH} characters.`;
  }

  return null;
}

export function isSameVerifiedUser(
  expectedUserId: string | null,
  user: UserIdentity | null | undefined,
) {
  return (
    typeof expectedUserId === 'string' &&
    expectedUserId.length > 0 &&
    typeof user?.id === 'string' &&
    user.id === expectedUserId
  );
}

export function safeAuthError(action: AuthAction, error: unknown): string {
  const { code, message, status } = errorDetails(error);
  const combined = `${code} ${message}`;

  if (
    status === 429 ||
    combined.includes('rate limit') ||
    combined.includes('too many requests') ||
    combined.includes('over_email_send_rate_limit')
  ) {
    return 'Too many attempts. Wait a moment and try again.';
  }

  if (
    combined.includes('failed to fetch') ||
    combined.includes('network') ||
    combined.includes('fetch failed')
  ) {
    return 'Unable to connect. Check your connection and try again.';
  }

  if (
    action === 'sign-in' &&
    (code === 'invalid_credentials' ||
      combined.includes('invalid login credentials'))
  ) {
    return 'Email or password is incorrect.';
  }

  if (
    action === 'sign-in' &&
    (code === 'email_not_confirmed' || combined.includes('email not confirmed'))
  ) {
    return 'Confirm your email before signing in.';
  }

  if (
    (action === 'sign-up' || action === 'update') &&
    (code === 'weak_password' || combined.includes('weak password'))
  ) {
    return `Choose a stronger password with at least ${NEW_PASSWORD_MIN_LENGTH} characters.`;
  }

  if (
    action === 'sign-up' &&
    (code === 'signup_disabled' || combined.includes('signups not allowed'))
  ) {
    return 'Account creation is temporarily unavailable.';
  }

  switch (action) {
    case 'sign-in':
      return 'Unable to sign in. Check your details and try again.';
    case 'sign-up':
      return 'Unable to create the account. Try signing in or resetting your password.';
    case 'reset':
      return 'Unable to send reset instructions. Please try again.';
    case 'update':
      return 'Unable to update the password. Request a new reset link and try again.';
    case 'sign-out':
      return 'Your password was updated, but this browser is still signed in.';
  }
}

export function resetRequestNotice(error: unknown): AuthNotice {
  const { code, message, status } = errorDetails(error);
  const combined = `${code} ${message}`;

  if (
    status === 429 ||
    combined.includes('rate limit') ||
    combined.includes('too many requests') ||
    combined.includes('over_email_send_rate_limit')
  ) {
    return { kind: 'error', text: safeAuthError('reset', error) };
  }

  if (
    combined.includes('failed to fetch') ||
    combined.includes('network') ||
    combined.includes('fetch failed')
  ) {
    return { kind: 'error', text: safeAuthError('reset', error) };
  }

  return { kind: 'success', text: RESET_REQUEST_CONFIRMATION };
}

export function authQueryNotice(
  status: string | null,
  error: string | null,
): AuthNotice | null {
  if (status === 'password_updated') {
    return {
      kind: 'success',
      text: 'Password updated. Sign in with your new password.',
    };
  }

  switch (error) {
    case 'invalid_link':
      return {
        kind: 'error',
        text: 'This email link is invalid or incomplete. Request a new one.',
      };
    case 'verification_failed':
      return {
        kind: 'error',
        text: 'This email link is invalid, expired, or already used. Request a new one.',
      };
    default:
      return null;
  }
}
