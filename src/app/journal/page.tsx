'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR, { useSWRConfig } from 'swr';
import { prependSavedReflection, reflectJournalEntry, type JournalEntries, type SavedReflections } from '@/lib/journal-client';
import { useJournalSave } from '@/lib/useJournalSave';


class RequestError extends Error {
  constructor(readonly status: number) {
    super('Unable to load journal data.');
  }
}

async function fetcher(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new RequestError(response.status);
  return response.json();
}

const requestOptions = {
  errorRetryCount: 2,
  shouldRetryOnError: (error: RequestError) =>
    error.status !== 401 && error.status !== 403,
};

export default function JournalPage() {
  const { mutate } = useSWRConfig();
  const { draft: content, updateDraft: setContent, saving, error: saveError, message: saveMessage, buttonLabel, save: saveEntry } = useJournalSave();
  const [reflectingId, setReflectingId] = useState<string | null>(null);
  const [reflectionError, setReflectionError] = useState<{ entryId: string; message: string } | null>(null);
  const reflectionPending = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // daily prompt
  const { data: promptData, error: promptError } = useSWR<{ text: string }, RequestError>(
    '/api/prompts/today', fetcher, requestOptions,
  );

  // list of entries
  const { data: entriesData, error: entriesError } = useSWR<JournalEntries, RequestError>(
    '/api/entries',
    fetcher,
    requestOptions,
  );

  const entries = entriesData?.entries ?? [];

const { data: savedData, error: reflectionsError } = useSWR<SavedReflections, RequestError>(
  '/api/reflect', fetcher, requestOptions,
);
const loadErrors = [promptError, entriesError, reflectionsError];
const unauthenticated = loadErrors.some((error) => error?.status === 401);
const loadFailed = loadErrors.some(Boolean);

const visibleReflections: Record<string, string> = {};

for (const r of savedData?.reflections ?? []) {
  if (visibleReflections[r.entry_id] === undefined) {
    visibleReflections[r.entry_id] = r.content;
  }
}

  async function reflectEntry(entryId: string) {
    if (reflectionPending.current) return;
    reflectionPending.current = true;
    setReflectingId(entryId);
    setReflectionError(null);
    try {
      const text = await reflectJournalEntry(entryId);
      if (!alive.current) return;
      void mutate<SavedReflections>(
        '/api/reflect', current => prependSavedReflection(current, entryId, text), { revalidate: false },
      ).catch(() => {});
    } catch (error) {
      if (!alive.current) return;
      setReflectionError({
        entryId,
        message: error instanceof Error && error.name === 'Error'
          ? error.message : 'Your journal entry is saved, but its reflection failed. Please try again.',
      });
    } finally {
      reflectionPending.current = false;
      if (alive.current) setReflectingId(null);
    }
  }

  const today = new Date().toLocaleDateString();

  if (unauthenticated) {
    return (
      <div className="mx-auto max-w-4xl py-8" role="alert">
        <p>Your session has expired or you are signed out. Sign in to view your journal.</p>
        {content && (
          <div className="my-4">
            <label htmlFor="unsaved-journal-draft">
              Copy your unsaved draft before signing in:
            </label>
            <textarea
              id="unsaved-journal-draft"
              readOnly
              value={content}
              className="mt-2 min-h-[160px] w-full rounded-xl border p-4"
            />
          </div>
        )}
        <Link href="/auth" className="underline">Sign in</Link>
      </div>
    );
  }

return (
  <div className="relative mx-auto w-full max-w-4xl pb-20 pt-8 sm:pt-14">
    {loadFailed && (
      <p role="alert" className="mb-6">
        Some journal data could not be loaded. Please refresh to try again.
      </p>
    )}

    {/* Page introduction */}
    <header className="mb-10 sm:mb-14">
      <div className="mb-5 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-[#A99ACB]" />
        <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-[#8A819A]">
          Your private space
        </span>
      </div>

      <h1
        className="text-4xl font-normal tracking-tight text-[#292638] sm:text-6xl"
        style={{ fontFamily: 'Georgia, serif' }}
      >
        A moment for yourself.
      </h1>

      <p className="mt-4 max-w-xl text-base leading-relaxed text-[#777080]">
        No expectations. No perfect words.
        Just a quiet place to understand yourself.
      </p>

      <p className="mt-5 text-xs tracking-wide text-[#958B9B]">
        {today}
      </p>
    </header>

    {/* Daily reflection prompt */}
    <section className="relative mb-7 overflow-hidden rounded-[28px] border border-[#E7DFF0] bg-gradient-to-br from-[#F0EAF9] via-[#F8F4FC] to-[#F8F1EF] p-6 sm:p-9">
      <div className="relative z-10">
        <div className="mb-5 flex items-center gap-2">
          <span className="text-lg text-[#8472AC]">✦</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#75648D]">
            A thought for today
          </span>
        </div>

        <h2
          className="max-w-2xl text-2xl leading-snug text-[#373045] sm:text-3xl"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          {promptData?.text ?? (promptError ? 'Daily prompt unavailable.' : 'Take a moment to notice what matters to you.')}
        </h2>

        <p className="mt-6 text-xs text-[#94899E]">
          A little curiosity can lead somewhere meaningful.
        </p>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/40 blur-3xl"
      />
    </section>

    {/* Journal editor */}
    <section className="mb-14 rounded-[28px] border border-[#EAE5ED] bg-white/90 p-5 shadow-[0_16px_50px_rgba(45,35,75,0.04)] sm:p-8">

      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium tracking-tight text-[#302B3C]">
            Your thoughts
          </h2>
          <p className="mt-1 text-xs text-[#918B97]">
            Write freely. This space is yours.
          </p>
        </div>

        <span className="rounded-full bg-[#F4F0F9] px-3 py-1.5 text-[11px] text-[#776B8D]">
          Private journal
        </span>
      </div>

      <label htmlFor="journal-content" className="sr-only">
        Write your journal entry
      </label>

      <textarea
        id="journal-content"
        maxLength={20000}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What's on your mind today?"
        className="min-h-[230px] w-full resize-y rounded-2xl border border-[#EEE9F0] bg-[#FCFBFD] p-5 text-base leading-8 text-[#342F40] outline-none transition-colors placeholder:text-[#A5A0AB] focus:border-[#A99ACB] focus:ring-2 focus:ring-[#A99ACB]/20"
      />

      <p role="status" aria-live="polite" aria-atomic="true" className="mt-3 text-sm text-[#777080]">{saveMessage}</p>
      {saveError && <p role="alert" className="mt-3 text-sm text-[#777080]">{saveError}</p>}

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[#99919D]">
          {content.trim().length} characters
        </p>

        <button
          type="button"
          onClick={saveEntry}
          disabled={saving || !content.trim()}
          className="min-h-[48px] w-full rounded-xl bg-[#342D47] px-7 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#514367] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#76649D] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {buttonLabel}
        </button>
      </div>
    </section>

    {/* Journal history */}
    <section>
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-[#91859C]">
            Your journey
          </p>
          <h2
            className="text-3xl font-normal text-[#302B3C]"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            Earlier reflections
          </h2>
        </div>

        <span className="text-xs text-[#918B97]">
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {!entriesError && entriesData && entries.length === 0 && (
        <div className="rounded-[24px] border border-dashed border-[#DCD4E7] p-10 text-center">
          <p className="text-sm text-[#82798D]">
            Your story begins with a single thought.
          </p>
        </div>
      )}

      <ul className="space-y-5">
        {entries.map((e) => (
          <li
            key={e.id}
            className="overflow-hidden rounded-[24px] border border-[#EAE5ED] bg-white/90 p-5 shadow-[0_8px_35px_rgba(45,35,75,0.035)] sm:p-7"
          >
            <div className="mb-5 flex items-center gap-3">
              <span
                aria-hidden="true"
                className="h-8 w-1 rounded-full bg-[#C4B4DE]"
              />

              <time
                dateTime={e.created_at}
                className="text-xs font-medium tracking-wide text-[#898092]"
              >
                {new Date(e.created_at).toLocaleDateString(
                  undefined,
                  {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  }
                )}
              </time>
            </div>

            <p className="whitespace-pre-wrap break-words text-[15px] leading-8 text-[#474251]">
              {e.content_text}
            </p>

            <div className="mt-6 border-t border-[#F0ECF2] pt-5">

              {visibleReflections[e.id] && (
                <div className="mb-5 rounded-2xl bg-[#F5F1FA] p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-[#8771B5]">✦</span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#76658D]">
                      FutureMe insight
                    </span>
                  </div>

                  <p className="whitespace-pre-wrap break-words text-sm leading-7 text-[#50455E]">
                    {visibleReflections[e.id]}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => reflectEntry(e.id)}
                disabled={reflectingId !== null}
                className="min-h-[44px] rounded-xl border border-[#E4DCEB] bg-white px-5 py-2.5 text-sm font-medium text-[#695680] transition-colors hover:bg-[#F6F1FB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#76649D] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {reflectingId === e.id
                  ? 'Reflecting…'
                  : visibleReflections[e.id]
                    ? 'Reflect again ↗'
                    : '✦ Reflect with AI'}
              </button>
              {reflectionError?.entryId === e.id && (
                <p role="alert" className="mt-3 text-sm text-[#777080]">{reflectionError.message}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>

    <footer className="mt-16 text-center">
      <p
        className="text-lg italic text-[#9D90AB]"
        style={{ fontFamily: 'Georgia, serif' }}
      >
        Every thought is part of becoming.
      </p>
    </footer>

  </div>
);
}
