import type { DemoPage } from './catalog';

export type InteractionNote = DemoPage['notes'][number];
export interface NotesSnapshot {
  notes: InteractionNote[];
  sha: string | null;
}

const repository = 'lxz9512-prog/Bottle-Washer';
const contentBranch = 'codex/interaction-notes';
const api = `https://api.github.com/repos/${repository}`;

export class NotesError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

async function request(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${api}${path}`, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'GitHub 凭据无效或已过期，请重新连接。',
      403: '请求受限，请检查凭据的 Contents 读写权限或稍后重试。',
      404: '无法访问说明文件，请检查仓库访问权限。',
      409: '线上说明已被更新。请先读取最新版本，再合并你的修改。',
      422: '线上版本发生变化或内容无法保存，请读取最新版本后重试。',
    };
    throw new NotesError(
      messages[response.status] ?? '线上请求失败，请稍后重试。',
      response.status,
    );
  }
  return response.json();
}

function filePath(page: DemoPage) {
  return `/contents/interaction-notes/${encodeURIComponent(page.id)}.json`;
}

function validateNotes(value: unknown, page: DemoPage): InteractionNote[] {
  if (!Array.isArray(value) || value.length !== page.notes.length)
    throw new NotesError('线上说明格式不兼容，原有内容已保留。');
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
    return {
      title: note.title.trim(),
      body: note.body.trim(),
      target: page.notes[index].target,
    };
  });
}

export async function loadNotes(
  page: DemoPage,
  token = '',
): Promise<NotesSnapshot> {
  try {
    const file = await request(
      `${filePath(page)}?ref=${encodeURIComponent(contentBranch)}`,
      token,
    );
    const bytes = Uint8Array.from(
      atob(file.content.replace(/\s/g, '')),
      (char) => char.charCodeAt(0),
    );
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (data.version !== 1 || data.pageId !== page.id)
      throw new NotesError('线上说明格式不兼容，原有内容已保留。');
    return { notes: validateNotes(data.notes, page), sha: file.sha };
  } catch (error) {
    // No content branch or page file yet means this page still uses the bundled copy.
    if (error instanceof NotesError && error.status === 404)
      return { notes: page.notes, sha: null };
    throw error;
  }
}

async function ensureContentBranch(token: string) {
  try {
    await request(`/git/ref/heads/${contentBranch}`, token);
  } catch (error) {
    if (!(error instanceof NotesError) || error.status !== 404) throw error;
    const main = await request('/git/ref/heads/main', token);
    try {
      await request('/git/refs', token, {
        method: 'POST',
        body: JSON.stringify({
          ref: `refs/heads/${contentBranch}`,
          sha: main.object.sha,
        }),
      });
    } catch (creationError) {
      if (
        !(creationError instanceof NotesError) ||
        creationError.status !== 422
      )
        throw creationError;
      await request(`/git/ref/heads/${contentBranch}`, token);
    }
  }
}

export async function saveNotes(
  page: DemoPage,
  notes: InteractionNote[],
  sha: string | null,
  token: string,
): Promise<NotesSnapshot> {
  if (!token.trim())
    throw new NotesError('请先连接有仓库写入权限的 GitHub 凭据。');
  const validated = validateNotes(notes, page);
  await ensureContentBranch(token);
  const payload = JSON.stringify(
    { version: 1, pageId: page.id, notes: validated },
    null,
    2,
  );
  const content = btoa(
    Array.from(new TextEncoder().encode(payload), (byte) =>
      String.fromCharCode(byte),
    ).join(''),
  );
  const result = await request(filePath(page), token, {
    method: 'PUT',
    body: JSON.stringify({
      message: `Update ${page.title} interaction notes`,
      branch: contentBranch,
      content,
      ...(sha ? { sha } : {}),
    }),
  });
  return { notes: validated, sha: result.content.sha };
}
