// app/auth/update/page.tsx — handle reset session to set new password
// -----------------------------
'use client';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';


export default function UpdatePassword() {
const supabase = createBrowserClient();
const [pwd, setPwd] = useState('');
const [msg, setMsg] = useState<string | null>(null);
useEffect(()=>{
         // Supabase sets a recovery session on redirect
},[]);
return (
<div className="min-h-screen grid place-items-center p-6">
<form className="w-full max-w-md space-y-3" onSubmit={async (e)=>{e.preventDefault();
const { error } = await supabase.auth.updateUser({ password: pwd });
setMsg(error? error.message : 'Password updated. You can close this tab.');
}}>
<h1 className="text-xl font-semibold">Set new password</h1>
<input className="w-full rounded-xl bg-slate-100 px-3 py-2" placeholder="new password" type="password" value={pwd} onChange={e=>setPwd(e.target.value)} />
<button className="px-4 py-2 rounded-xl bg-slate-900 text-white">Update</button>
{msg && <p className="text-sm text-emerald-600">{msg}</p>}
</form>
</div>
);
}