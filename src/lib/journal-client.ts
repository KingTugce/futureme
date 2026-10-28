export type SavedEntry = {
  id: string;
  content_text: string;
  created_at: string;
};

export type JournalEntries = { entries: SavedEntry[] };
export type SavedReflections = { reflections: { entry_id: string; content: string }[] };

export function prependSavedEntry(current: JournalEntries | undefined, entry: SavedEntry): JournalEntries {
  return { entries: [entry, ...(current?.entries ?? []).filter(item => item.id !== entry.id)] };
}

export function prependSavedReflection(current: SavedReflections | undefined, entryId: string, text: string): SavedReflections {
  return {
    reflections: [
      { entry_id: entryId, content: text },
      ...(current?.reflections ?? []).filter(item => item.entry_id !== entryId),
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function saveJournalEntry(content: string): Promise<SavedEntry> {
  const response = await fetch('/api/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: content.trim() }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Please sign in before saving. Your draft is still here.');
    }
    throw new Error('Unable to save your entry. Your draft is still here; please try again.');
  }

  const payload: unknown = await response.json().catch(() => null);
  const entry = isRecord(payload) ? payload.entry : null;
  if (
    !isRecord(entry) ||
    typeof entry.id !== 'string' || !entry.id ||
    typeof entry.content_text !== 'string' ||
    typeof entry.created_at !== 'string'
  ) {
    throw new Error('The save could not be confirmed. Your draft is still here; check journal history before trying again.');
  }

  return { id: entry.id, content_text: entry.content_text, created_at: entry.created_at };
}

export async function reflectJournalEntry(entryId: string): Promise<string> {
  const response = await fetch('/api/reflect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entryId }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Sign in again before retrying the reflection. Your journal entry is saved.');
    }
    if (response.status === 429) {
      throw new Error('The AI usage limit has been reached. Your journal entry is saved; try the reflection later.');
    }
    if (response.status === 503) {
      throw new Error('Reflections are temporarily unavailable. Your journal entry is saved; try the reflection later.');
    }
    throw new Error('Your journal entry is saved, but its reflection failed. You can retry the reflection.');
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!isRecord(payload) || typeof payload.text !== 'string' || !payload.text.trim()) {
    throw new Error('Your journal entry is saved, but the reflection response could not be confirmed.');
  }
  return payload.text;
}
