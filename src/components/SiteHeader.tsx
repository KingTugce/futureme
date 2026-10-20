'use client';

import Link from 'next/link';
import { createClient } from '@/lib/supabase-old';
import { useEffect, useState } from 'react';
import QuickNoteTrigger from './QuickNoteTrigger';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

export default function SiteHeader() {
  const supabase = createClient();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
    })();
      const { data: sub } = supabase.auth.onAuthStateChange(
      (_e: AuthChangeEvent, s: Session | null) =>
      setEmail(s?.user?.email ?? null)
      );
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="text-[15px] font-semibold tracking-tight text-neutral-900">
          FutureMe
        </Link>

        <nav className="flex items-center gap-2">
          <Link
            href="/journal"
            className="rounded-lg px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Journal
          </Link>

          {email ? (
            <>
              <QuickNoteTrigger />
              <span className="hidden sm:inline text-xs text-neutral-500">{email}</span>
              <button
                onClick={logout}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-100"
              >
                Logout
              </button>
            </>
          ) : (
            <Link href="/auth" className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-black/80">
            Login
            </Link>

          )}
        </nav>
      </div>
    </header>
  );
}
