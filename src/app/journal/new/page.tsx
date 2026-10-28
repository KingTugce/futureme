'use client'
import Link from 'next/link'
import { useJournalSave } from '@/lib/useJournalSave'

export default function NewEntry() {
  const { draft: text, updateDraft: setText, saving, savedEntry, error, message, buttonLabel, save } = useJournalSave()
  return (
    <div style={{maxWidth:640,margin:'3rem auto',display:'grid',gap:12}}>
      <h1 style={{fontWeight:700, fontSize:22}}>New Entry</h1>
      <textarea
        aria-label="Your journal entry"
        maxLength={20000}
        style={{width:'100%',height:160,padding:12,border:'1px solid #ddd',borderRadius:10}}
        placeholder="Tell future-you what matters today (2–4 sentences)."
        value={text}
        onChange={e=>setText(e.target.value)}
      />
      {error && <p role="alert">{error}</p>}
      <p role="status" aria-live="polite" aria-atomic="true">{message}</p>
      <div style={{display:'flex',gap:8}}>
        <button onClick={save} disabled={!text.trim() || saving} style={{padding:'8px  12px',border: '1px solid #222',borderRadius:8}}>
          {buttonLabel}
        </button>
        <Link href="/journal" style={{padding:'8px 12px',border: '1px solid #aaa' ,borderRadius:8}}>{savedEntry ? 'Back to journal' : 'Cancel'}</Link>
      </div>
    </div>
  )
}
