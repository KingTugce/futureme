'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { AuthCard } from '../_components/auth-card';
import {
  RESET_REQUEST_CONFIRMATION,
  normalizeEmail,
  resetRequestNotice,
  validateEmail,
  type AuthNotice,
} from '../auth-helpers';
import { createBrowserClient } from '@/lib/supabase/client';

export default function ResetPage() {
  const supabase = createBrowserClient();
  const submittingRef = useRef(false);
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<AuthNotice | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    setNotice(null);
    const emailProblem = validateEmail(email);
    if (emailProblem) {
      setNotice({ kind: 'error', text: emailProblem });
      return;
    }

    submittingRef.current = true;
    setPending(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizeEmail(email),
        { redirectTo: `${window.location.origin}/auth/confirm` },
      );

      setNotice(
        error
          ? resetRequestNotice(error)
          : { kind: 'success', text: RESET_REQUEST_CONFIRMATION },
      );
    } catch (error) {
      setNotice(resetRequestNotice(error));
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  }

  return (
    <AuthCard
      badge="Private & secure · Account recovery"
      description="We’ll send a one-time link to set a new password."
      title="Reset your password"
    >
      <form noValidate aria-busy={pending} className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-200"
            htmlFor="reset-email"
          >
            Email address
          </label>
          <input
            id="reset-email"
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

        {notice && (
          <div
            role={notice.kind === 'error' ? 'alert' : 'status'}
            className={`rounded-lg border px-3 py-2 text-sm ${
              notice.kind === 'error'
                ? 'border-rose-200/70 bg-rose-50/80 text-rose-800 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200'
                : 'border-emerald-200/70 bg-emerald-50/80 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200'
            }`}
          >
            {notice.text}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-[linear-gradient(135deg,#3b82f6,#8b5cf6)] py-3 text-sm font-medium text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Sending…' : 'Send reset link'}
        </button>

        <p className="text-center text-xs">
          <Link
            className="font-medium text-sky-700 underline-offset-4 hover:underline dark:text-sky-300"
            href="/auth"
          >
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
