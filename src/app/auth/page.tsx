'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState, type FormEvent } from 'react';
import { AuthCard } from './_components/auth-card';
import { PasswordField } from './_components/password-field';
import {
  NEW_PASSWORD_MIN_LENGTH,
  authQueryNotice,
  normalizeEmail,
  safeAuthError,
  validateEmail,
  validateNewPassword,
  type AuthNotice,
} from './auth-helpers';
import { createBrowserClient } from '@/lib/supabase/client';

type Mode = 'sign-in' | 'sign-up';

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createBrowserClient();
  const submittingRef = useRef(false);
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<AuthNotice | null>(null);

  const queryNotice = authQueryNotice(
    searchParams?.get('status') ?? null,
    searchParams?.get('error') ?? null,
  );
  const visibleNotice = notice ?? queryNotice;

  function selectMode(nextMode: Mode) {
    if (submittingRef.current || pending || nextMode === mode) return;
    setMode(nextMode);
    setConfirmation('');
    setNotice(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    setNotice(null);
    const emailProblem = validateEmail(email);
    if (emailProblem) {
      setNotice({ kind: 'error', text: emailProblem });
      return;
    }

    if (!password) {
      setNotice({ kind: 'error', text: 'Enter your password.' });
      return;
    }

    if (mode === 'sign-up') {
      const passwordProblem = validateNewPassword(password);
      if (passwordProblem) {
        setNotice({ kind: 'error', text: passwordProblem });
        return;
      }
      if (password !== confirmation) {
        setNotice({ kind: 'error', text: 'Passwords do not match.' });
        return;
      }
    }

    submittingRef.current = true;
    setPending(true);

    try {
      const cleanEmail = normalizeEmail(email);

      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) {
          setNotice({ kind: 'error', text: safeAuthError('sign-in', error) });
          return;
        }

        router.replace('/journal');
        router.refresh();
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
        },
      });

      if (error) {
        setNotice({ kind: 'error', text: safeAuthError('sign-up', error) });
        return;
      }

      setPassword('');
      setConfirmation('');

      if (data.session) {
        router.replace('/journal');
        router.refresh();
        return;
      }

      setNotice({
        kind: 'success',
        text: 'Check your inbox for confirmation instructions. If you already have an account, sign in or reset your password.',
      });
    } catch (error) {
      setNotice({
        kind: 'error',
        text: safeAuthError(mode, error),
      });
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  }

  const isSignUp = mode === 'sign-up';

  return (
    <AuthCard
      badge="Private & secure · Password protected"
      description="Reflect with clarity. Your journal stays tied to your account."
      title="FutureMe"
    >
      <div
        aria-label="Choose an authentication mode"
        className="mb-5 grid grid-cols-2 rounded-xl bg-neutral-100 p-1 dark:bg-white/5"
        role="tablist"
      >
        <button
          type="button"
          aria-selected={!isSignUp}
          disabled={pending}
          onClick={() => selectMode('sign-in')}
          role="tab"
          className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
            !isSignUp
              ? 'bg-white text-neutral-900 shadow-sm dark:bg-white/10 dark:text-white'
              : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white'
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          aria-selected={isSignUp}
          disabled={pending}
          onClick={() => selectMode('sign-up')}
          role="tab"
          className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
            isSignUp
              ? 'bg-white text-neutral-900 shadow-sm dark:bg-white/10 dark:text-white'
              : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white'
          }`}
        >
          Create account
        </button>
      </div>

      <form noValidate aria-busy={pending} className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-200"
            htmlFor="auth-email"
          >
            Email address
          </label>
          <input
            id="auth-email"
            name="email"
            type="email"
            autoCapitalize="none"
            autoComplete="email"
            disabled={pending}
            maxLength={254}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            spellCheck={false}
            value={email}
            className="w-full rounded-xl border border-neutral-200 bg-white/80 px-4 py-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:ring-4 focus:ring-sky-400/25 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        </div>

        <PasswordField
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          disabled={pending}
          id="auth-password"
          label="Password"
          minLength={isSignUp ? NEW_PASSWORD_MIN_LENGTH : undefined}
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          value={password}
        />

        {isSignUp && (
          <PasswordField
            autoComplete="new-password"
            disabled={pending}
            id="auth-password-confirmation"
            label="Confirm password"
            minLength={NEW_PASSWORD_MIN_LENGTH}
            name="password-confirmation"
            onChange={(event) => setConfirmation(event.target.value)}
            value={confirmation}
          />
        )}

        {!isSignUp && (
          <div className="text-right">
            <Link
              className="text-xs font-medium text-sky-700 underline-offset-4 hover:underline dark:text-sky-300"
              href="/auth/reset"
            >
              Forgot password?
            </Link>
          </div>
        )}

        {visibleNotice && (
          <div
            id="auth-message"
            role={visibleNotice.kind === 'error' ? 'alert' : 'status'}
            className={`rounded-lg border px-3 py-2 text-sm ${
              visibleNotice.kind === 'error'
                ? 'border-rose-200/70 bg-rose-50/80 text-rose-800 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200'
                : 'border-emerald-200/70 bg-emerald-50/80 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200'
            }`}
          >
            {visibleNotice.text}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-[linear-gradient(135deg,#3b82f6,#8b5cf6)] py-3 text-sm font-medium text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending
            ? isSignUp
              ? 'Creating account…'
              : 'Signing in…'
            : isSignUp
              ? 'Create account'
              : 'Sign in'}
        </button>

        <p className="pt-1 text-center text-[11px] text-neutral-500 dark:text-neutral-400">
          Use a password unique to FutureMe.
        </p>
      </form>
    </AuthCard>
  );
}

function AuthFallback() {
  return (
    <AuthCard
      badge="Private & secure · Password protected"
      description="Preparing secure sign in…"
      title="FutureMe"
    >
      <div className="h-64 animate-pulse rounded-2xl bg-neutral-100 dark:bg-white/5" />
    </AuthCard>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthFallback />}>
      <AuthForm />
    </Suspense>
  );
}
