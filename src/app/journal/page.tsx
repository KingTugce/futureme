'use client';

import { useState } from 'react';
import useSWR from 'swr';


const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function JournalPage() {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [reflections, setReflections] = useState<Record<string, string>>({});
  const [reflectingId, setReflectingId] = useState<string | null>(null);

  // daily prompt
  const { data: promptData } = useSWR('/api/prompts/today', fetcher);

  // list of entries
  const { data: entriesData, mutate: mutateEntries } = useSWR(
    '/api/entries',
    fetcher,
  );

  const entries = entriesData?.entries ?? [];

const { data: savedData } = useSWR('/api/reflect', fetcher);

const savedReflections: Record<string, string> = {};

for (const r of (savedData?.reflections ?? []) as Array<{
  entry_id: string;
  content: string;
}>) {
  if (savedReflections[r.entry_id] === undefined) {
    savedReflections[r.entry_id] = r.content;
  }
}

const visibleReflections = {
  ...savedReflections,
  ...reflections,
};


  async function saveEntry() {
    const body = content.trim();
    if (!body) return;

    setSaving(true);
    const res = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json ' },
      body: JSON.stringify({ content: body }),
    });
    setSaving(false);

    const payload = await res.json().catch(() => ({} as any));

    if (!res.ok) {
      alert(payload.error ??   'Error saving entry' );
      return;
    }

    setContent('');
    mutateEntries();   //refresh list
    alert('Saved.');
  }


async function reflectEntry(entry: { id: string; content_text: string }) {
  setReflectingId(entry.id);

  try {
    const res = await fetch('/api/reflect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
      entryId: entry.id,
      content: entry.content_text,
        }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error('Reflection request failed');
    }

    setReflections((prev) => ({
      ...prev,
      [entry.id]: data.text || 'No reflection returned.',
    }));
  } catch {
    alert('Unable to generate reflection. Please try again.');
  } finally {
    setReflectingId(null);
  }
}

  const today = new Date().toLocaleDateString();

  return (
    <div className= "max-w-3xl mx-auto p-6 space-y-6" >
      <header className= "flex items-end justify-between" >
        <div>
          <h1 className= "text-2xl font-semibold" >Journal</h1>
          <p className=  "text-sm text-slate-500" >{today}</p>
        </div>
      </header>

      {/* Daily prompt */}
      <section className= "rounded-2xl border border-slate-200 p-4 bg-white" >
        <p className= "text-xs uppercase tracking-wide text-slate-500" >
          Daily prompt
        </p>
        <p className= "mt-1 text-slate-900" >
          {promptData?.text ?? '—'}
        </p>
      </section>

      {/* New entry */}
      <section className= "space-y-2" >
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className= "w-full min-h-[160px] rounded-2xl border border-slate-200 p-4 outline-none text-sm"
          placeholder= "Write honestly. This is just for you."
        />
        <div className= "flex justify-end">
          <button
            onClick={saveEntry}
            disabled={saving || !content.trim()}
            className= "px-4 py-2 rounded-xl bg-slate-900 text-white text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save entry' }
          </button>
        </div>
      </section>

      {/* Entries list */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">
          Recent entries
        </h2>

        {entries.length === 0 && (
          <p className="text-xs text-slate-500">
            No entries yet. Your first one will appear here.
          </p>
        )}

        <ul className="space-y-2">
          {entries.map((e: any) => (
            <li
              key={e.id}
              className="rounded-xl border border-slate-200 bg-white p-3 text-sm"
            >
              <div className="text-[11px] text-slate-400">
                {new Date(e.created_at).toLocaleString()}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-slate-800">
                {e.content_text}
              </p>


                <button
                  type="button"
                  onClick={() => reflectEntry(e)}
                  disabled={reflectingId !== null}
                  className="mt-3 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  {reflectingId === e.id ? 'Reflecting…' : 'Reflect with AI'}
                </button>

                  {visibleReflections[e.id] && (
                <p className="mt-3 rounded-xl bg-indigo-50 p-3 text-sm text-slate-800">
                  {visibleReflections[e.id]}
                </p>
              )}


            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
