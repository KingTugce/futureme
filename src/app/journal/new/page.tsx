'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export default function NewEntry() {
  const [session, setSession] = useState<any>(null)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
  }, [])

const save = async () => {
  if (!session) return alert('Please log in first at /auth-test');
  if (!text.trim()) return alert('Write something first.');
  setSaving(true);

  const { error } = await supabase
    .from('journal')               //  <--  use journal(not entries)
    .insert({
      user_id: session.user.id,    //  <--  required for RLS
      content: text.trim(),        //  <--  column is content (not content_text)
    });

  setSaving(false);
  if (error) return alert(error.message);

  //redirect back to the list
  window.location.href = '/journal';
  //(or if you’re using the App Router hook:)
  //router.push('/journal') ;
};
  return (
    <div style={{maxWidth:640,margin:'3rem auto',display:'grid',gap:12}}>
      <h1 style={{fontWeight:700, fontSize:22}}>New Entry</h1>
      <textarea
        style={{width:'100%',height:160,padding:12,border:'1px solid #ddd',borderRadius:10}}
        placeholder="Tell future-you what matters today (2–4 sentences)."
        value={text}
        onChange={e=>setText(e.target.value)}
      />
      <div style={{display:'flex',gap:8}}>
        <button onClick={save} disabled={saving} style={{padding:'8px  12px',border: '1px solid #222',borderRadius:8}}>
          {saving ? 'Saving…'  :  'Save'}
        </button>
        <a href="/journal" style={{padding:'8px 12px',border: '1px solid #aaa' ,borderRadius:8}}>Cancel</a>
      </div>
    </div>
  )
}
