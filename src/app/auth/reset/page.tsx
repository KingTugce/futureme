//    app/(auth)/reset/page.tsx  —   password reset flow (Supabase built‑in)
//    -----------------------------
'use client';
import { useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';


export default function ResetPage(){
const supabase = createBrowserClient();
const [email, setEmail] = useState('');
const [msg, setMsg] = useState<string | null>(null) ;
return (
<div className="min-h-screen  grid place-items-center p-6">
<form className="w-full max-w-md space-y-3" onSubmit={async (e)=>{e.preventDefault();
const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: ` ${location.origin}/auth/update` });
setMsg(error? error.message : 'Check your inbox to reset.');
}}>
<h1 className="text-xl font-semibold ">Reset password</h1>
<input className="w-full rounded-xl bg-slate-100 px-3 py-2" placeholder="you@email.com"  value={email} onChange={e=>setEmail(e.target.value)} />
<button className="px-4 py-2 rounded-xl bg-slate-900 text-white">Send reset link   </button>
{msg &&  <p className="text-sm  text-emerald-600">{msg}   </p>}
</form>
</div>
);
}