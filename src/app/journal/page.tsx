'use client';

import { useState } from 'react';
import useSWR from 'swr';


const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function JournalPage() {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  // daily prompt
  const { data: promptData } = useSWR('/api/prompts/today', fetcher);

  // list of entries
  const { data: entriesData, mutate: mutateEntries } = useSWR(
    '/api/entries',
    fetcher,
  );

  const entries = entriesData?.entries ?? [];

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
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
