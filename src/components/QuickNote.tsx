'use client';
import { useEffect, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import { prependSavedReflection, reflectJournalEntry, type SavedReflections } from '@/lib/journal-client';
import { useJournalSave } from '@/lib/useJournalSave';

type Props = { open: boolean; onClose: () => void };

export default function QuickNote({ open, onClose }: Props) {
  return open ? <QuickNoteContent onClose={onClose} /> : null;
}

function QuickNoteContent({ onClose }: Pick<Props, 'onClose'>) {
  const { mutate } = useSWRConfig();
  const reflectionPending = useRef(false);
  const alive = useRef(true);
  const { draft: text, updateDraft: setText, save, saving, savedEntry, error: saveError, message, buttonLabel } = useJournalSave();
  const [prompt, setPrompt] = useState<string>('What mattered most today?');
  const [reflectingId, setReflectingId] = useState<string | null>(null);
  const [reflectionError, setReflectionError] = useState<{ entryId: string; message: string } | null>(null);
  const [reflection, setReflection] = useState<{ entryId: string; text: string } | null>(null);
  const [countdown, setCountdown] = useState(60);
  const chips = ["Win", "Blocker", "Grateful", "Next step"];

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/prompts/today', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) return;
        const data: unknown = await response.json();
        if (!controller.signal.aborted && data && typeof data === 'object' &&
          'text' in data && typeof data.text === 'string' && data.text.trim()) {
          setPrompt(data.text);
        }
      })
      .catch(() => { /* Keep the fallback prompt if unavailable. */ });
    return () => controller.abort();
  }, []);

  // simple countdown
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  async function reflect() {
    if (!savedEntry || reflectionPending.current) return;
    const entryId = savedEntry.id;
    reflectionPending.current = true;
    setReflectingId(entryId);
    setReflectionError(null);
    try {
      const result = await reflectJournalEntry(entryId);
      if (!alive.current) return;
      setReflection({ entryId, text: result });
      void mutate<SavedReflections>(
        '/api/reflect', current => prependSavedReflection(current, entryId, result), { revalidate: false },
      ).catch(() => {});
    } catch (error) {
      if (!alive.current) return;
      setReflectionError({
        entryId,
        message: error instanceof Error && error.name === 'Error'
          ? error.message
          : 'Your journal entry is saved, but its reflection failed. You can retry the reflection.',
      });
    } finally {
      reflectionPending.current = false;
      if (alive.current) setReflectingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0f1216] p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-200">One-Minute Mode</h2>
          <div className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-zinc-300">{countdown}s</div>
        </div>

        <p className="mt-2 text-sm text-zinc-400">{prompt}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map(c => (
            <button
              key={c}
              onClick={() => setText(t => (t ? t + ' #' + c.toLowerCase().replace(' ','-') : '#' + c.toLowerCase().replace(' ','-') + ' '))}
              className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-zinc-300 hover:bg-white/[0.07]"
            >
              {c}
            </button>
          ))}
        </div>

        <textarea
          aria-label="Your quick journal note"
          value={text}
          maxLength={20000}
          onChange={e => setText(e.target.value)}
          rows={5}
          placeholder="Type one honest sentence…"
          className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-[#0b0d10] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-sky-400/30"
        />

        <p role="status" aria-live="polite" aria-atomic="true" className="mt-3 text-sm text-zinc-300">{message}</p>
        {saveError && <p role="alert" className="mt-3 text-sm text-rose-300">{saveError}</p>}

        {savedEntry && (
          <div className="mt-3 text-sm text-zinc-300">
            <p>Your last journal entry is saved. An AI reflection is optional.</p>
            {reflection?.entryId === savedEntry.id && <p className="mt-2 whitespace-pre-wrap">{reflection.text}</p>}
            {reflectionError?.entryId === savedEntry.id && <p role="alert" className="mt-3 text-sm text-rose-300">{reflectionError.message}</p>}
            <button
              onClick={reflect}
              disabled={reflectingId !== null || saving}
              className="mt-3 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/[0.05] disabled:opacity-60"
            >
              {reflectingId !== null ? 'Reflecting…' : reflectionError?.entryId === savedEntry.id ? 'Retry reflection' : reflection?.entryId === savedEntry.id ? 'Reflect again' : 'Reflect with AI'}
            </button>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving || reflectingId !== null} className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/[0.05] disabled:opacity-60">
            {savedEntry ? 'Close' : 'Cancel'}
          </button>
          <button
            onClick={save}
            disabled={!text.trim() || saving}
            className="rounded-lg bg-gradient-to-br from-sky-400 to-violet-500 px-4 py-1.5 text-sm font-medium text-black disabled:opacity-60"
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
