'use client';

import { useEffect, useRef, useState, type SetStateAction } from 'react';
import { useSWRConfig } from 'swr';
import { prependSavedEntry, saveJournalEntry, type JournalEntries, type SavedEntry } from './journal-client';

export function useJournalSave() {
  const { mutate } = useSWRConfig();
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [savedEntry, setSavedEntry] = useState<SavedEntry | null>(null);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const draftRevision = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  function updateDraft(value: SetStateAction<string>) {
    draftRevision.current += 1;
    setDraft(value);
    setStatus(current => current === 'saving' ? current : 'idle');
  }

  async function save() {
    if (!draft.trim() || pending.current) return;
    const submittedDraft = draft;
    const submittedRevision = draftRevision.current;
    pending.current = true;
    setStatus('saving');
    setError('');

    try {
      const entry = await saveJournalEntry(submittedDraft);
      if (!alive.current) return;
      // Only the confirmed server result enters history. This mutation is scoped
      // to the current account's SWR provider and does not refetch the full list.
      void mutate<JournalEntries>(
        '/api/entries', current => prependSavedEntry(current, entry), { revalidate: false },
      ).catch(() => {});
      setSavedEntry(entry);
      setDraft(current => draftRevision.current === submittedRevision ? '' : current);
      setStatus('saved');
    } catch (failure) {
      if (!alive.current) return;
      setError(failure instanceof Error && failure.name === 'Error'
        ? failure.message
        : 'The save could not be confirmed. Your draft is still here; check journal history before trying again.');
      setStatus('idle');
    } finally {
      pending.current = false;
    }
  }

  const saving = status === 'saving';
  const message = saving ? 'Saving…'
    : status === 'saved' ? `Saved ✓${draft.trim() ? '. Your newer text is still a draft.' : ''}` : '';
  const buttonLabel = saving ? 'Saving…' : status === 'saved' && !draft.trim() ? 'Saved ✓' : 'Save';

  return { draft, updateDraft, save, saving, savedEntry, error, message, buttonLabel };
}
