'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase-old';

export default function AuthPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string>('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const clean = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(clean)) {
      setMsg('Please enter a valid email. ');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/confirm`,
 },

    });
    setLoading(false);
    setMsg(error ? error.message : '✨ Magic link sent. Check your inbox. ');
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f8fafc,#eef2ff)] dark:bg-[linear-gradient(135deg,#0b0e11,#111827)] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-white/20 bg-white/70 dark:bg-white/5 shadow-[0_10px_35px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        <div className="px-8 pt-8 pb-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 px-3 py-1 text-[11px] text-neutral-600 dark:text-neutral-300">
            Private & secure · Magic link
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            FutureMe
          </h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
            Reflect with clarity. Log in via email.
          </p>
        </div>

        <form onSubmit= {handleLogin} className= "px-8 pb-8 space-y-3">
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-neutral-200 dark:border-white/15 bg-white/80 dark:bg-white/5 px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 outline-none focus:ring-4 focus:ring-sky-400/25"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full   rounded-xl bg-[linear-gradient(135deg,#3b82f6,#8b5cf6)] text-white font-medium py-3 text-sm hover:opacity-95 disabled:opacity-60 transition"
          >
            {loading ? 'Sending…' : 'Send Magic Link'}
          </button>

          {msg && (
            <div className =" rounded-lg border border-sky-200/60 dark:border-sky-400/20 bg-sky-50/80 dark:bg-sky-500/10 px-3 py-2 text-xs text-sky-700 dark:text-sky-200">
              {msg}
            </div>
          )}

          <p className="pt-2 text-[11px] text-neutral-500 dark:text-neutral-400 text-center">
                By continuing you agree to our respectful use of email.
          </p>
        
        </form>
      </div>
    </main>
  );
}
