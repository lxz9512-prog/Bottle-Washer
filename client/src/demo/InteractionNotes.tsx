import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  Pencil,
  RefreshCw,
  Save,
  X,
} from 'lucide-react';
import type { DemoPage } from './catalog';
import {
  loadNotes,
  NotesError,
  saveNotes,
  type InteractionNote,
  type NotesSnapshot,
} from './interaction-notes';

interface PageEditor {
  snapshot: NotesSnapshot;
  draft: InteractionNote[] | null;
}

export default function InteractionNotes({
  page,
  open,
  onClose,
}: {
  page: DemoPage;
  open: boolean;
  onClose: () => void;
}) {
  const [editors, setEditors] = useState<Record<string, PageEditor>>({});
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingPages, setSavingPages] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const requestId = useRef(0);
  const editor = editors[page.id];
  const snapshot = editor?.snapshot ?? { notes: page.notes, sha: null };
  const draft = editor?.draft;
  const notes = draft ?? snapshot.notes;
  const saving = savingPages.has(page.id);

  useEffect(() => {
    setMessage('');
    setFailed(false);
    setConnecting(false);
    setTokenInput('');
    setBusy(false);
    const id = ++requestId.current;
    if (!open || editor?.draft) return;
    setBusy(true);
    loadNotes(page, token)
      .then((value) => {
        if (id === requestId.current)
          setEditors((current) => ({
            ...current,
            [page.id]: { snapshot: value, draft: null },
          }));
      })
      .catch((error) => {
        if (id === requestId.current) {
          setMessage(errorMessage(error));
          setFailed(true);
        }
      })
      .finally(() => {
        if (id === requestId.current) setBusy(false);
      });
    return () => {
      requestId.current++;
    };
  }, [page.id, open]);

  const readLatest = async () => {
    const id = ++requestId.current;
    setBusy(true);
    setMessage('');
    try {
      const latest = await loadNotes(page, token);
      if (id !== requestId.current) return;
      setEditors((current) => ({
        ...current,
        [page.id]: { snapshot: latest, draft: current[page.id]?.draft ?? null },
      }));
      setFailed(false);
      setMessage(
        draft
          ? '已读取线上版本。草稿已保留，可对照线上内容继续编辑。'
          : '已读取最新说明。',
      );
    } catch (error) {
      if (id === requestId.current) {
        setMessage(errorMessage(error));
        setFailed(true);
      }
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  };
  const edit = () => {
    setEditors((current) => ({
      ...current,
      [page.id]: {
        snapshot,
        draft: snapshot.notes.map((note) => ({ ...note })),
      },
    }));
    setMessage('');
  };
  const update = (index: number, field: 'title' | 'body', value: string) => {
    setEditors((current) => {
      const state = current[page.id];
      return {
        ...current,
        [page.id]: {
          ...state,
          draft: state.draft!.map((note, i) =>
            i === index ? { ...note, [field]: value } : note,
          ),
        },
      };
    });
  };
  const save = async () => {
    if (!draft || busy || saving) return;
    if (!token) {
      setConnecting(true);
      return;
    }
    const id = ++requestId.current;
    setBusy(true);
    setSavingPages((current) => new Set(current).add(page.id));
    setMessage('');
    try {
      const saved = await saveNotes(page, draft, snapshot.sha, token);
      // Keep the saved result even if the reader changes page while the request runs.
      setEditors((current) => ({
        ...current,
        [page.id]: { snapshot: saved, draft: null },
      }));
      if (id === requestId.current) {
        setMessage('已保存到线上。');
        setFailed(false);
      }
    } catch (error) {
      if (id === requestId.current) {
        setMessage(errorMessage(error));
        setFailed(true);
      }
    } finally {
      setSavingPages((current) => {
        const next = new Set(current);
        next.delete(page.id);
        return next;
      });
      if (id === requestId.current) setBusy(false);
    }
  };
  return (
    <aside
      hidden={!open}
      className="tool-panel info-panel"
      aria-label="交互说明"
    >
      <header>
        <BookOpen size={18} />
        <h2>交互说明</h2>
        <button
          title="关闭交互说明"
          aria-label="关闭交互说明"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="notes-toolbar">
        <span>{page.title}</span>
        <button
          aria-label="读取最新说明"
          title="读取最新说明"
          disabled={busy || saving}
          onClick={readLatest}
        >
          <RefreshCw size={15} />
        </button>
        {!draft && (
          <button disabled={busy || saving || !editor} onClick={edit}>
            <Pencil size={15} />
            编辑
          </button>
        )}
        {draft && (
          <>
            <button
              disabled={busy || saving}
              onClick={() => {
                setEditors((current) => ({
                  ...current,
                  [page.id]: { snapshot, draft: null },
                }));
                setMessage('');
                setConnecting(false);
                setTokenInput('');
              }}
            >
              取消
            </button>
            <button disabled={busy || saving} onClick={save}>
              <Save size={15} />
              {saving ? '保存中…' : '保存到线上'}
            </button>
          </>
        )}
      </div>
      <div className="tool-body">
        {message && (
          <p
            className={`notes-message ${failed ? 'has-error' : ''}`}
            role={failed ? 'alert' : 'status'}
          >
            {message}
          </p>
        )}
        {busy && !draft && (
          <p role="status" className="tool-muted">
            正在读取线上说明…
          </p>
        )}
        {connecting && (
          <form
            className="notes-connection"
            onSubmit={(event) => {
              event.preventDefault();
              setToken(tokenInput.trim());
              setTokenInput('');
              setConnecting(false);
              setMessage('已连接，请点击“保存到线上”。');
            }}
          >
            <label htmlFor="notes-token">GitHub 保存凭据</label>
            <p>
              使用可访问 Bottle-Washer 仓库且具备 Contents 读写权限的
              fine-grained token。凭据仅在当前页面有效。
            </p>
            <input
              id="notes-token"
              type="password"
              autoComplete="off"
              required
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
            />
            <div>
              <button
                type="button"
                onClick={() => {
                  setConnecting(false);
                  setTokenInput('');
                }}
              >
                取消
              </button>
              <button type="submit">连接</button>
            </div>
            <a
              href="https://github.com/settings/personal-access-tokens/new"
              target="_blank"
              rel="noopener noreferrer"
            >
              创建 GitHub 凭据
            </a>
          </form>
        )}
        {notes.map((note, index) =>
          draft ? (
            <section
              className="note-editor"
              key={`${page.id}:${index}`}
              data-note-target={note.target}
            >
              <label>
                标题
                <input
                  aria-label={`说明 ${index + 1} 标题`}
                  value={note.title}
                  maxLength={120}
                  disabled={busy || saving}
                  onChange={(event) =>
                    update(index, 'title', event.target.value)
                  }
                />
              </label>
              <label>
                正文
                <textarea
                  aria-label={`说明 ${index + 1} 正文`}
                  value={note.body}
                  maxLength={10000}
                  disabled={busy || saving}
                  onChange={(event) =>
                    update(index, 'body', event.target.value)
                  }
                />
              </label>
              {(snapshot.notes[index].body !== note.body ||
                snapshot.notes[index].title !== note.title) && (
                <details className="notes-comparison">
                  <summary>
                    查看线上版本
                    <ChevronDown size={14} />
                  </summary>
                  <p>
                    {snapshot.notes[index].title}
                    {'\n'}
                    {snapshot.notes[index].body}
                  </p>
                </details>
              )}
            </section>
          ) : (
            <details
              key={`${page.id}:${index}`}
              open
              data-note-target={note.target}
            >
              <summary>
                {note.title}
                <ChevronDown size={16} />
              </summary>
              <p>{note.body}</p>
            </details>
          ),
        )}
        {token && (
          <button
            className="notes-disconnect"
            onClick={() => {
              setToken('');
              setMessage('已断开 GitHub 保存连接。');
            }}
          >
            断开保存连接
          </button>
        )}
      </div>
    </aside>
  );
}

function errorMessage(error: unknown) {
  return error instanceof NotesError
    ? error.message
    : '连接线上说明失败，请检查网络后重试。草稿已保留。';
}
