'use client';

import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import QuickNoteTrigger from './QuickNoteTrigger';
import { useAuthSession } from './AuthSessionProvider';

export default function SiteHeader() {
  const { user } = useAuthSession();
  const router = useRouter();
  const pending = useRef(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');

  const logout = async () => {
    if (pending.current) return;
    pending.current = true;
    setSigningOut(true);
    setError('');
    try {
      const { error: signOutError } = await createBrowserClient().auth.signOut({ scope: 'local' });
      if (signOutError) throw signOutError;
      router.replace('/auth');
      router.refresh();
    } catch {
      setError('Unable to sign out. Please try again.');
    } finally {
      pending.current = false;
      setSigningOut(false);
    }
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

          {user ? (
            <>
              <QuickNoteTrigger />
              <span className="hidden sm:inline text-xs text-neutral-500">{user.email}</span>
              <Link href="/auth/update" className="text-xs text-neutral-600 underline">Set password</Link>
              <button
                onClick={logout}
                disabled={signingOut}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-100"
              >
                {signingOut ? 'Signing out…' : 'Logout'}
              </button>
            </>
          ) : (
            <Link href="/auth" className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-black/80">
            Login
            </Link>

          )}
        </nav>
      </div>
      {error && <p role="alert" className="px-5 pb-2 text-sm text-rose-700">{error}</p>}
    </header>
  );
}
