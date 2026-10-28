'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  isAuthSessionMissingError,
  type AuthChangeEvent,
  type Session,
  type User,
} from '@supabase/supabase-js';
import { SWRConfig } from 'swr';
import { createBrowserClient } from '@/lib/supabase/client';

const VERIFICATION_TIMEOUT_MS = 10_000;

type VerificationStatus = 'checking' | 'ready' | 'error';
type AuthState = {
  user: User | null;
  status: VerificationStatus;
  epoch: number;
  hasVerifiedIdentity: boolean;
};

type AuthContextState = { user: User | null; ready: boolean };
const AuthContext = createContext<AuthContextState>({ user: null, ready: false });

export function useAuthSession() {
  return useContext(AuthContext);
}

function SessionCache({ children }: { children: ReactNode }) {
  // Each identity gets a fresh cache. Late responses can only reach the old map.
  const [config] = useState(() => ({ provider: () => new Map() }));
  return <SWRConfig value={config}>{children}</SWRConfig>;
}

export default function AuthSessionProvider({ children }: { children: ReactNode }) {
  const retryVerificationRef = useRef<() => void>(() => undefined);
  const [state, setState] = useState<AuthState>({
    user: null,
    status: 'checking',
    epoch: 0,
    hasVerifiedIdentity: false,
  });

  useEffect(() => {
    const supabase = createBrowserClient();
    let active = true;
    let revision = 0;
    let knownId: string | null | undefined;
    let status: VerificationStatus = 'checking';
    let deferredTimer: ReturnType<typeof setTimeout> | undefined;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

    function clearVerificationTimers() {
      clearTimeout(deferredTimer);
      clearTimeout(timeoutTimer);
      deferredTimer = undefined;
      timeoutTimer = undefined;
    }

    function showVerificationError(expectedRevision: number) {
      if (!active || expectedRevision !== revision) return;
      revision += 1;
      status = 'error';
      clearVerificationTimers();
      setState(previous => ({ ...previous, status: 'error' }));
    }

    function commitVerifiedUser(user: User | null, expectedRevision: number) {
      if (!active || expectedRevision !== revision) return;

      const nextId = user?.id ?? null;
      const identityChanged = knownId !== undefined && nextId !== knownId;
      knownId = nextId;
      status = 'ready';
      clearVerificationTimers();
      setState(previous => ({
        user,
        status: 'ready',
        epoch: identityChanged ? previous.epoch + 1 : previous.epoch,
        hasVerifiedIdentity: true,
      }));
    }

    async function verify(expectedRevision: number) {
      const attemptTimeout = setTimeout(() => {
        showVerificationError(expectedRevision);
      }, VERIFICATION_TIMEOUT_MS);
      timeoutTimer = attemptTimeout;

      try {
        const { data, error } = await supabase.auth.getUser();
        clearTimeout(attemptTimeout);
        if (timeoutTimer === attemptTimeout) timeoutTimer = undefined;

        if (!active || expectedRevision !== revision) return;
        if (error) {
          if (isAuthSessionMissingError(error)) {
            commitVerifiedUser(null, expectedRevision);
          } else {
            showVerificationError(expectedRevision);
          }
          return;
        }

        commitVerifiedUser(data.user, expectedRevision);
      } catch {
        clearTimeout(attemptTimeout);
        if (timeoutTimer === attemptTimeout) timeoutTimer = undefined;
        showVerificationError(expectedRevision);
      }
    }

    function beginVerification({
      defer = false,
      resetIdentity = false,
    }: { defer?: boolean; resetIdentity?: boolean } = {}) {
      const expectedRevision = ++revision;
      status = 'checking';
      clearVerificationTimers();
      setState(previous => ({
        ...previous,
        user: resetIdentity ? null : previous.user,
        status: 'checking',
        epoch:
          resetIdentity && previous.hasVerifiedIdentity
            ? previous.epoch + 1
            : previous.epoch,
        hasVerifiedIdentity: resetIdentity
          ? false
          : previous.hasVerifiedIdentity,
      }));

      if (defer) {
        deferredTimer = setTimeout(() => {
          deferredTimer = undefined;
          void verify(expectedRevision);
        }, 0);
      } else {
        void verify(expectedRevision);
      }
    }

    retryVerificationRef.current = () => beginVerification();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (!active || event === 'INITIAL_SESSION') return;
      const user = session?.user ?? null;
      const nextId = user?.id ?? null;
      if (event === 'SIGNED_OUT') {
        revision += 1;
        knownId = null;
        status = 'ready';
        clearVerificationTimers();
        setState(previous => ({
          user: null,
          status: 'ready',
          epoch: previous.epoch + 1,
          hasVerifiedIdentity: true,
        }));
      } else if (nextId !== knownId) {
        // Clear the previous identity immediately, then verify the new one. The
        // SDK call is deferred so it never runs inside this auth callback lock.
        knownId = nextId;
        beginVerification({ defer: true, resetIdentity: true });
      } else {
        // Token refresh / user updates for the same account keep drafts intact,
        // but cannot bypass an in-progress or failed remote verification.
        setState(previous => ({
          ...previous,
          user,
          status: status === 'ready' ? 'ready' : previous.status,
        }));
      }
    });

    beginVerification();

    function restorePage(event: PageTransitionEvent) {
      if (!event.persisted) return;
      // Keep the mounted tree (and its drafts/cache) while it is concealed.
      // A verified identity change advances the epoch in commitVerifiedUser.
      beginVerification();
    }
    window.addEventListener('pageshow', restorePage);
    return () => {
      active = false;
      revision += 1;
      clearVerificationTimers();
      retryVerificationRef.current = () => undefined;
      subscription.unsubscribe();
      window.removeEventListener('pageshow', restorePage);
    };
  }, []);

  const ready = state.status === 'ready';

  return (
    <AuthContext.Provider value={{ user: state.user, ready }}>
      {state.hasVerifiedIdentity && (
        <div
          aria-hidden={ready ? undefined : true}
          className={ready ? 'contents' : undefined}
          hidden={!ready}
        >
          <SessionCache key={state.epoch}>{children}</SessionCache>
        </div>
      )}

      {state.status === 'checking' && (
        <p role="status" className="p-6 text-sm text-neutral-500">Checking your session…</p>
      )}

      {state.status === 'error' && (
        <div className="space-y-3 p-6" data-testid="session-verification-error">
          <p role="alert" className="text-sm text-rose-700">
            We couldn’t verify your session. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => retryVerificationRef.current()}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100"
          >
            Retry session check
          </button>
        </div>
      )}
    </AuthContext.Provider>
  );
}
