import { pages } from '../client/src/demo/catalog.ts';

const sessionCookie = 'bottle_washer_editor';
const sessionSeconds = 12 * 60 * 60;
const encoder = new TextEncoder();

function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

async function hash(value) {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', encoder.encode(value)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

async function signingKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function cookieValue(request) {
  return request.headers
    .get('Cookie')
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${sessionCookie}=`))
    ?.slice(sessionCookie.length + 1);
}

async function authenticated(request, env) {
  const token = cookieValue(request);
  if (!token || !env.SESSION_SECRET) return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || !/^[\da-f]{64}$/.test(signature))
    return false;
  const expires = Number(payload.split(':')[0]);
  if (
    !Number.isSafeInteger(expires) ||
    expires <= Math.floor(Date.now() / 1000)
  )
    return false;
  const bytes = Uint8Array.from(signature.match(/../g), (value) =>
    parseInt(value, 16),
  );
  return crypto.subtle.verify(
    'HMAC',
    await signingKey(env.SESSION_SECRET),
    bytes,
    encoder.encode(payload),
  );
}

function cookie(request, value, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${sessionCookie}=${value}; Path=/api/notes; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

async function readBody(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json'))
    return null;
  // Bound actual streamed bytes, including requests with no Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 2000000) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    return null;
  }
}

function validNotes(value, page) {
  if (!Array.isArray(value) || value.length > 40) return null;
  const notes = [];
  const identifiers = new Set();
  for (const [index, note] of value.entries()) {
    if (
      !note ||
      typeof note.title !== 'string' ||
      typeof note.body !== 'string' ||
      !note.title.trim() ||
      !note.body.trim() ||
      note.title.length > 120 ||
      note.body.length > 10000
    )
      return null;
    const id = note.id ?? `legacy-${index}`;
    if (
      typeof id !== 'string' ||
      !/^(legacy-\d{1,3}|custom-[\da-f-]{36})$/.test(id) ||
      identifiers.has(id)
    )
      return null;
    identifiers.add(id);
    const source = /^legacy-(\d+)$/.exec(id);
    notes.push({
      id,
      title: note.title.trim(),
      body: note.body.trim(),
      target: source ? (page.notes[Number(source[1])]?.target ?? '') : '',
    });
  }
  return notes;
}

async function session(request, env) {
  if (request.method === 'GET')
    return json({ unlocked: await authenticated(request, env) });
  if (request.method === 'DELETE')
    return json({ unlocked: false }, 200, {
      'Set-Cookie': cookie(request, '', 0),
    });
  if (request.method !== 'POST')
    return json({ message: '不支持此操作。' }, 405);
  if (!env.EDIT_PASSWORD_HASH || !env.SESSION_SECRET)
    return json({ message: '编辑密码尚未配置。' }, 503);
  const body = await readBody(request);
  if (typeof body?.password !== 'string' || body.password.length > 200)
    return json({ message: '请输入编辑密码。' }, 400);
  const clientKey = await hash(
    `${request.headers.get('CF-Connecting-IP') ?? 'local'}:${env.SESSION_SECRET}`,
  );
  const now = Math.floor(Date.now() / 1000);
  const attempts = await env.DB.prepare(
    `INSERT INTO login_attempts (client_key, attempts, started_at) VALUES (?, 1, ?)
    ON CONFLICT(client_key) DO UPDATE SET
    attempts = CASE WHEN started_at < ? THEN 1 ELSE attempts + 1 END,
    started_at = CASE WHEN started_at < ? THEN excluded.started_at ELSE started_at END
    RETURNING attempts`,
  )
    .bind(clientKey, now, now - 900, now - 900)
    .first();
  if (attempts.attempts > 10)
    return json({ message: '尝试次数较多，请 15 分钟后再试。' }, 429);
  if ((await hash(body.password)) !== env.EDIT_PASSWORD_HASH)
    return json({ message: '编辑密码不正确，请重试。' }, 401);
  await env.DB.prepare('DELETE FROM login_attempts WHERE client_key = ?')
    .bind(clientKey)
    .run();
  const payload = `${now + sessionSeconds}:${crypto.randomUUID()}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      await signingKey(env.SESSION_SECRET),
      encoder.encode(payload),
    ),
  );
  const token = `${payload}.${Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  return json({ unlocked: true }, 200, {
    'Set-Cookie': cookie(request, token, sessionSeconds),
  });
}

async function notes(request, env, page) {
  if (request.method === 'GET') {
    const row = await env.DB.prepare(
      'SELECT notes_json, revision FROM interaction_notes WHERE page_id = ?',
    )
      .bind(page.id)
      .first();
    return json(
      row
        ? {
            notes: validNotes(JSON.parse(row.notes_json), page),
            revision: row.revision,
          }
        : { notes: validNotes(page.notes, page), revision: null },
    );
  }
  if (request.method !== 'PUT') return json({ message: '不支持此操作。' }, 405);
  if (!(await authenticated(request, env)))
    return json({ message: '请先输入编辑密码解锁。' }, 401);
  const body = await readBody(request);
  const next = validNotes(body?.notes, page);
  if (!next || !(body.revision === null || typeof body.revision === 'string'))
    return json({ message: '请填写完整的标题和正文。' }, 400);
  const revision = crypto.randomUUID();
  const statement =
    body.revision === null
      ? env.DB.prepare(
          'INSERT INTO interaction_notes (page_id, notes_json, revision) VALUES (?, ?, ?) ON CONFLICT(page_id) DO NOTHING',
        ).bind(page.id, JSON.stringify(next), revision)
      : env.DB.prepare(
          'UPDATE interaction_notes SET notes_json = ?, revision = ?, updated_at = CURRENT_TIMESTAMP WHERE page_id = ? AND revision = ?',
        ).bind(JSON.stringify(next), revision, page.id, body.revision);
  const result = await statement.run();
  if (result.meta.changes !== 1)
    return json(
      { message: '线上说明已被更新。请读取最新版本后合并修改。' },
      409,
    );
  return json({ notes: next, revision });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (['POST', 'PUT', 'DELETE'].includes(request.method)) {
        const origin = request.headers.get('Origin');
        if (origin && origin !== url.origin)
          return json({ message: '请从 Demo 网页进行编辑。' }, 403);
      }
      if (url.pathname === '/api/notes/session')
        return await session(request, env);
      const match = url.pathname.match(/^\/api\/notes\/pages\/([a-z-]+)$/);
      const page =
        match && Object.hasOwn(pages, match[1]) ? pages[match[1]] : null;
      if (page) return await notes(request, env, page);
      return json({ message: '未找到该页面。' }, 404);
    } catch (error) {
      console.error(
        'Notes API failure',
        error instanceof Error ? error.message : 'unknown',
      );
      return json(
        { message: '保存服务暂时不可用，请稍后重试。草稿已保留。' },
        503,
      );
    }
  },
};
