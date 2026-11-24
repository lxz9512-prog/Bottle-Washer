import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type { DemoPage } from './catalog';
import {
  loadNotes,
  editingSession,
  unlockEditing,
  lockEditing,
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
  const [unlocked, setUnlocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingPages, setSavingPages] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const requestId = useRef(0);
  const sessionRequestId = useRef(0);
  const editor = editors[page.id];
  const snapshot: NotesSnapshot = editor?.snapshot ?? {
    notes: page.notes,
    revision: null,
  };
  const draft = editor?.draft;
  const notes = draft ?? snapshot.notes;
  const saving = savingPages.has(page.id);

  useEffect(() => {
    setMessage('');
    setFailed(false);
    setUnlocking(false);
    setPasswordInput('');
    setBusy(false);
    const id = ++requestId.current;
    if (!open || editor) return;
    setBusy(true);
    loadNotes(page)
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

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), failed ? 6500 : 3000);
    return () => window.clearTimeout(timer);
  }, [message, failed]);

  useEffect(() => {
    const id = ++sessionRequestId.current;
    if (open)
      editingSession()
        .then((value) => {
          if (id === sessionRequestId.current) setUnlocked(value);
        })
        .catch(() => {
          if (id === sessionRequestId.current) setUnlocked(false);
        });
    return () => {
      sessionRequestId.current++;
    };
  }, [open]);

  const readLatest = async () => {
    const id = ++requestId.current;
    setBusy(true);
    setMessage('');
    try {
      const latest = await loadNotes(page);
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
    if (!unlocked) {
      setUnlocking(true);
      return;
    }
    startDraft();
  };
  const startDraft = () => {
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
  const addNote = () => {
    if (!draft || busy || saving || draft.length >= 40) return;
    setEditors((current) => ({
      ...current,
      [page.id]: {
        ...current[page.id],
        draft: [
          ...current[page.id].draft!,
          {
            id: `custom-${crypto.randomUUID()}`,
            title: '',
            body: '',
            target: '',
          },
        ],
      },
    }));
    setMessage('');
    setFailed(false);
  };
  const removeNote = (index: number) => {
    if (!draft || busy || saving) return;
    setEditors((current) => ({
      ...current,
      [page.id]: {
        ...current[page.id],
        draft: current[page.id].draft!.filter((_, i) => i !== index),
      },
    }));
    setMessage('');
    setFailed(false);
  };
  const save = async () => {
    if (!draft || busy || saving) return;
    if (!unlocked) {
      setUnlocking(true);
      return;
    }
    const id = ++requestId.current;
    setBusy(true);
    setSavingPages((current) => new Set(current).add(page.id));
    setMessage('');
    try {
      const saved = await saveNotes(page, draft, snapshot.revision);
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
        if (error instanceof NotesError && error.status === 401) {
          setUnlocked(false);
          setUnlocking(true);
        }
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
      inert={!open}
      aria-hidden={!open}
      data-open={open}
      className="tool-panel side-rail info-panel"
      aria-label="交互说明"
    >
      <header>
        <BookOpen size={18} />
        <h2>交互说明</h2>
        <div className="notes-header-actions">
          <button
            aria-label="读取最新说明"
            title={busy ? '正在读取说明…' : '读取最新说明'}
            aria-busy={busy && !saving}
            disabled={busy || saving}
            onClick={readLatest}
          >
            <RefreshCw
              size={15}
              className={busy && !saving ? 'notes-refreshing' : undefined}
            />
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
                  setUnlocking(false);
                  setPasswordInput('');
                }}
              >
                取消
              </button>
              <button
                aria-label="保存到线上"
                disabled={busy || saving}
                onClick={save}
              >
                <Save size={15} />
                <span>
                  {saving ? (
                    '保存中…'
                  ) : (
                    <>
                      保存<span className="notes-save-destination">到线上</span>
                    </>
                  )}
                </span>
              </button>
            </>
          )}
          {message && (
            <div
              className={'notes-toast' + (failed ? ' has-error' : '')}
              role={failed ? 'alert' : 'status'}
              aria-atomic="true"
            >
              {failed ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
              <span>{message}</span>
            </div>
          )}
        </div>
        <button
          title="关闭交互说明"
          aria-label="关闭交互说明"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <p className="notes-page-title">{page.title}</p>
      <div className="tool-body">
        {unlocking && (
          <form
            className="notes-connection"
            onSubmit={async (event) => {
              event.preventDefault();
              const id = ++requestId.current;
              setBusy(true);
              setMessage('');
              try {
                sessionRequestId.current++;
                await unlockEditing(passwordInput);
                setUnlocked(true);
                if (id === requestId.current) {
                  setPasswordInput('');
                  setUnlocking(false);
                  setFailed(false);
                  if (!draft) startDraft();
                  setMessage('已解锁编辑。');
                }
              } catch (error) {
                if (id === requestId.current) {
                  setMessage(errorMessage(error));
                  setFailed(true);
                }
              } finally {
                if (id === requestId.current) setBusy(false);
              }
            }}
          >
            <label htmlFor="notes-password">编辑密码</label>
            <p>输入编辑密码解锁，修改后点击保存即可同步到线上。</p>
            <input
              id="notes-password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={200}
              disabled={busy}
              value={passwordInput}
              onChange={(event) => setPasswordInput(event.target.value)}
            />
            <div>
              <button
                type="button"
                onClick={() => {
                  setUnlocking(false);
                  setPasswordInput('');
                }}
              >
                取消
              </button>
              <button type="submit" disabled={busy}>
                {busy ? '解锁中…' : '解锁编辑'}
              </button>
            </div>
          </form>
        )}
        {notes.length === 0 && (
          <p className="tool-muted">
            {draft ? '暂无说明，点击下方“新增说明”添加。' : '暂无交互说明。'}
          </p>
        )}
        {notes.map((note, index) => {
          const previous = note.id
            ? snapshot.notes.find((saved) => saved.id === note.id)
            : snapshot.notes[index];
          return draft ? (
            <section
              className="note-editor"
              key={`${page.id}:${note.id ?? index}`}
              data-note-target={note.target}
            >
              <button
                className="note-remove"
                aria-label={`删除说明 ${index + 1}`}
                disabled={busy || saving}
                onClick={() => removeNote(index)}
              >
                <Trash2 size={14} />
                删除说明
              </button>
              <label>
                标题
                <input
                  aria-label={`说明 ${index + 1} 标题`}
                  value={note.title}
                  maxLength={120}
                  autoFocus={!previous}
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
              {previous &&
                (previous.body !== note.body ||
                  previous.title !== note.title) && (
                  <details className="notes-comparison">
                    <summary>
                      查看线上版本
                      <ChevronDown size={14} />
                    </summary>
                    <p>
                      {previous.title}
                      {'\n'}
                      {previous.body}
                    </p>
                  </details>
                )}
            </section>
          ) : (
            <details
              key={`${page.id}:${note.id ?? index}`}
              open
              data-note-target={note.target}
            >
              <summary>
                {note.title}
                <ChevronDown size={16} />
              </summary>
              <p>{note.body}</p>
            </details>
          );
        })}
        {draft && (
          <button
            className="notes-add"
            disabled={busy || saving || draft.length >= 40}
            onClick={addNote}
          >
            <Plus size={16} />
            {draft.length >= 40 ? '最多添加 40 项说明' : '新增说明'}
          </button>
        )}
        {unlocked && (
          <button
            className="notes-disconnect"
            onClick={async () => {
              try {
                sessionRequestId.current++;
                await lockEditing();
                setUnlocked(false);
                setMessage('编辑已锁定。');
                setFailed(false);
              } catch (error) {
                setMessage(errorMessage(error));
                setFailed(true);
              }
            }}
          >
            锁定编辑
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
