//  src/pages/api/entries.ts
import type { NextApiRequest, NextApiResponse } from 'next';

type Data =
  | { ok: true }
  | { entries: any[] }
  | { error: string }; 
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method === 'GET') {
    // Always     return an     empty list for now
    return res.status(200).json({ entries: [] });
  }

  if (req.method === 'POST') {
    // Always    succeed, ignore body,    ignore DB
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method Not Allowed' });
}
