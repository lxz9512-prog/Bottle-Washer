import type { DemoPage } from './catalog';

export type InteractionNote = DemoPage['notes'][number] & { id?: string };
export interface NotesSnapshot {
  notes: InteractionNote[];
  revision: string | null;
}

export class NotesError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`/api/notes${path}`, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new NotesError(
      data?.message ?? '云端请求失败，请稍后重试。',
      response.status,
    );
  }
  return response.json();
}

function validateNotes(value: unknown, page: DemoPage): InteractionNote[] {
  if (!Array.isArray(value) || value.length > 40)
    throw new NotesError('线上说明格式不兼容，原有内容已保留。');
  const identifiers = new Set<string>();
  return value.map((note, index) => {
    if (
      !note ||
      typeof note.title !== 'string' ||
      typeof note.body !== 'string' ||
      !note.title.trim() ||
      !note.body.trim() ||
      note.title.length > 120 ||
      note.body.length > 10000
    ) {
      throw new NotesError(
        '每项说明需要标题和正文，标题最多 120 字，正文最多 10000 字。',
      );
    }
    const id = note.id ?? `legacy-${index}`;
    if (
      typeof id !== 'string' ||
      !/^(legacy-\d{1,3}|custom-[\da-f-]{36})$/.test(id) ||
      identifiers.has(id)
    ) {
      throw new NotesError('线上说明格式不兼容，请读取最新说明后重试。');
    }
    identifiers.add(id);
    const source = /^legacy-(\d+)$/.exec(id);
    return {
      id,
      title: note.title.trim(),
      body: note.body.trim(),
      target: source ? (page.notes[Number(source[1])]?.target ?? '') : '',
    };
  });
}

function snapshot(data: NotesSnapshot, page: DemoPage): NotesSnapshot {
  if (!(data.revision === null || typeof data.revision === 'string'))
    throw new NotesError('线上说明格式不兼容。');
  return { notes: validateNotes(data.notes, page), revision: data.revision };
}

export async function loadNotes(page: DemoPage): Promise<NotesSnapshot> {
  return snapshot(await request(`/pages/${encodeURIComponent(page.id)}`), page);
}

export async function saveNotes(
  page: DemoPage,
  notes: InteractionNote[],
  revision: string | null,
): Promise<NotesSnapshot> {
  return snapshot(
    await request(`/pages/${encodeURIComponent(page.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ notes: validateNotes(notes, page), revision }),
    }),
    page,
  );
}

export async function editingSession(): Promise<boolean> {
  return (await request('/session')).unlocked === true;
}

export async function unlockEditing(password: string): Promise<void> {
  await request('/session', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function lockEditing(): Promise<void> {
  await request('/session', { method: 'DELETE' });
}
