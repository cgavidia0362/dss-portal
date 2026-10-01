import { supabase } from './supabase';

const OPTIONAL_CALL_COLUMNS = [
  'last_activity_at',
  'last_activity_by',
  'last_activity_by_name',
  'follow_up_at',
] as const;

function isMissingColumnError(error: { message?: string; code?: string } | null) {
  const msg = (error?.message || '').toLowerCase();
  return msg.includes('column') || msg.includes('schema cache') || msg.includes('does not exist');
}

function withoutOptionalColumns(patch: Record<string, unknown>) {
  const fallback = { ...patch };
  for (const col of OPTIONAL_CALL_COLUMNS) delete fallback[col];
  return fallback;
}

export async function updateCallById(id: string, patch: Record<string, unknown>) {
  const first = await supabase.from('calls').update(patch).eq('id', id);
  if (!first.error) return first;
  if (!isMissingColumnError(first.error)) return first;
  return supabase.from('calls').update(withoutOptionalColumns(patch)).eq('id', id);
}

export async function updateCallsByIds(ids: string[], patch: Record<string, unknown>) {
  if (ids.length === 0) return { data: null, error: null, count: null, status: 200, statusText: 'OK' };
  const first = await supabase.from('calls').update(patch).in('id', ids);
  if (!first.error) return first;
  if (!isMissingColumnError(first.error)) return first;
  return supabase.from('calls').update(withoutOptionalColumns(patch)).in('id', ids);
}
