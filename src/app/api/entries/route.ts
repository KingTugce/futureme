
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET() {
  const supabase = supabaseServer();

  const { data: { user }, error: authError } =
    await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from('entries')
    .select('id, content_text, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error loading entries:', error);
    return NextResponse.json(
      { error: 'Unable to load entries' },
      { status: 500 }
    );
  }

  return NextResponse.json({ entries: data });
}

export async function POST(request: Request) {
  const supabase = supabaseServer();

  const { data: { user }, error: authError } =
    await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400 }
    );
  }

  const content = body?.content;

  if (
    typeof content !== 'string' ||
    !content.trim() ||
    content.length > 20000
  ) {
    return NextResponse.json(
      { error: 'Invalid entry content' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('entries')
    .insert({
      user_id: user.id,
      content_text: content.trim()
    })
    .select('id, content_text, created_at')
    .single();

  if (error) {
    console.error('Error saving entry:', error);
    return NextResponse.json(
      { error: 'Unable to save entry' },
      { status: 500 }
    );
  }

  return NextResponse.json({ entry: data }, { status: 201 });
}
