'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AuthCard } from '../_components/auth-card';
import { PasswordField } from '../_components/password-field';
import {
  NEW_PASSWORD_MIN_LENGTH,
  isSameVerifiedUser,
  safeAuthError,
  validateNewPassword,
  type AuthNotice,
} from '../auth-helpers';
import { createBrowserClient } from '@/lib/supabase/client';

type SessionGate = 'checking' | 'ready' | 'blocked';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const supabase = createBrowserClient();
  const aliveRef = useRef(false);
  const operationRef = useRef(false);
  const verifiedUserIdRef = useRef<string | null>(null);
  const [gate, setGate] = useState<SessionGate>('checking');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [notice, setNotice] = useState<AuthNotice | null>(null);

  useEffect(() => {
    let active = true;
    aliveRef.current = true;

    async function verifyInitialSession() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!active) return;
        if (error || !data.user) {
          verifiedUserIdRef.current = null;
          setGate('blocked');
          setNotice({
            kind: 'error',
            text: 'This reset session is invalid or expired. Request a new reset link.',
          });
          return;
        }

        verifiedUserIdRef.current = data.user.id;
        setGate('ready');
      } catch {
        if (!active) return;
        verifiedUserIdRef.current = null;
        setGate('blocked');
        setNotice({
          kind: 'error',
          text: 'Unable to verify this reset session. Request a new reset link.',
        });
      }
    }

    void verifyInitialSession();

    return () => {
      active = false;
      aliveRef.current = false;
      verifiedUserIdRef.current = null;
    };
  }, [supabase]);

  function finish() {
    router.replace('/auth?status=password_updated');
    router.refresh();
  }

  async function signOutLocally() {
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) return false;
      finish();
      return true;
    } catch {
      return false;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (operationRef.current || gate !== 'ready' || passwordUpdated) return;

    setNotice(null);
    const passwordProblem = validateNewPassword(password);
    if (passwordProblem) {
      setNotice({ kind: 'error', text: passwordProblem });
      return;
    }
    if (password !== confirmation) {
      setNotice({ kind: 'error', text: 'Passwords do not match.' });
      return;
    }

    operationRef.current = true;
    setPending(true);

    try {
      const expectedUserId = verifiedUserIdRef.current;
      const { data: verified, error: verificationError } =
        await supabase.auth.getUser();

      if (!aliveRef.current) return;

      if (
        verificationError ||
        !isSameVerifiedUser(expectedUserId, verified.user)
      ) {
        verifiedUserIdRef.current = null;
        setGate('blocked');
        setNotice({
          kind: 'error',
          text: 'This reset session is invalid or expired. Request a new reset link.',
        });
        return;
      }

      if (!aliveRef.current) return;
      const { error } = await supabase.auth.updateUser({ password });
      if (!aliveRef.current) return;

      if (error) {
        setNotice({ kind: 'error', text: safeAuthError('update', error) });
        return;
      }

      setPasswordUpdated(true);
      setPassword('');
      setConfirmation('');

      if (!(await signOutLocally())) {
        if (!aliveRef.current) return;
        setNotice({
          kind: 'error',
          text: `${safeAuthError('sign-out', null)} Finish signing out before leaving this page.`,
        });
      }
    } catch (error) {
      if (!aliveRef.current) return;
      setNotice({ kind: 'error', text: safeAuthError('update', error) });
    } finally {
      operationRef.current = false;
      if (aliveRef.current) setPending(false);
    }
  }

  async function retrySignOut() {
    if (operationRef.current || !passwordUpdated) return;
    operationRef.current = true;
    setPending(true);
    setNotice(null);

    if (!(await signOutLocally())) {
      if (!aliveRef.current) return;
      setNotice({
        kind: 'error',
        text: `${safeAuthError('sign-out', null)} Try finishing sign-out again.`,
      });
    }

    operationRef.current = false;
    if (aliveRef.current) setPending(false);
  }

  return (
    <AuthCard
      badge="Private & secure · Verified recovery"
      description="Choose a new password for this account."
      title="Set a new password"
    >
      {gate === 'checking' && (
        <div aria-live="polite" className="space-y-3" role="status">
          <div className="h-12 animate-pulse rounded-xl bg-neutral-100 dark:bg-white/5" />
          <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
            Verifying your reset link…
          </p>
        </div>
      )}

      {gate === 'blocked' && (
        <div className="space-y-4">
          <div
            className="rounded-lg border border-rose-200/70 bg-rose-50/80 px-3 py-2 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200"
            role="alert"
          >
            {notice?.text}
          </div>
          <Link
            className="block w-full rounded-xl bg-[linear-gradient(135deg,#3b82f6,#8b5cf6)] py-3 text-center text-sm font-medium text-white"
            href="/auth/reset"
          >
            Request a new reset link
          </Link>
        </div>
      )}

      {gate === 'ready' && !passwordUpdated && (
        <form noValidate aria-busy={pending} className="space-y-4" onSubmit={handleSubmit}>
          <PasswordField
            autoComplete="new-password"
            disabled={pending}
            id="new-password"
            label="New password"
            minLength={NEW_PASSWORD_MIN_LENGTH}
            name="new-password"
            onChange={(event) => setPassword(event.target.value)}
            value={password}
          />
          <PasswordField
            autoComplete="new-password"
            disabled={pending}
            id="new-password-confirmation"
            label="Confirm new password"
            minLength={NEW_PASSWORD_MIN_LENGTH}
            name="new-password-confirmation"
            onChange={(event) => setConfirmation(event.target.value)}
            value={confirmation}
          />

          {notice && (
            <div
              className="rounded-lg border border-rose-200/70 bg-rose-50/80 px-3 py-2 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200"
              role="alert"
            >
              {notice.text}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-[linear-gradient(135deg,#3b82f6,#8b5cf6)] py-3 text-sm font-medium text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Updating…' : 'Update password'}
          </button>
        </form>
      )}

      {gate === 'ready' && passwordUpdated && (
        <div className="space-y-4">
          <div
            className="rounded-lg border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100"
            role="alert"
          >
            {notice?.text ??
              'Your password was updated, but this browser is still signed in.'}
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={retrySignOut}
            className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-neutral-900"
          >
            {pending ? 'Signing out…' : 'Finish signing out'}
          </button>
        </div>
      )}
    </AuthCard>
  );
}
