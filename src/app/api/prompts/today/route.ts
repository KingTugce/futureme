// app/api/prompt/today/route.ts — serve one prompt/day/user + log
// -----------------------------
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';


export async function GET(){
const supabase = await supabaseServer();
const { data: { user } } = await supabase.auth.getUser();
if(!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });


const today = new Date().toISOString().slice(0,10);
const { data: existing } = await supabase.from('user_prompt_log').select('id, prompt_id, served_on, daily_prompts:prompt_id(text)').eq('user_id', user.id).eq('served_on', today).maybeSingle();
if(existing) {
const relatedPrompt = existing.daily_prompts as { text: string } | { text: string }[] | null;
const prompt = Array.isArray(relatedPrompt) ? relatedPrompt[0] : relatedPrompt;
if(!prompt) return NextResponse.json({ error: 'Prompt unavailable.' }, { status: 500 });
return NextResponse.json({ id: existing.prompt_id, text: prompt.text });
}


// rotate deterministically by day for stability
const { data: prompts } = await supabase.from('daily_prompts').select('id, text').eq('active', true).order('id', { ascending: true });
if(!prompts || prompts.length===0) return NextResponse.json({ text: 'Prompt library empty.' });
const idx = Math.abs(hash(`${user.id}:${today}`)) % prompts.length;
const picked = prompts[idx];
await supabase.from('user_prompt_log').insert({ user_id: user.id, prompt_id: picked.id, served_on: today });
return NextResponse.json({ id: picked.id, text: picked.text });
}


function hash(s:string){ let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0;} return h; }
