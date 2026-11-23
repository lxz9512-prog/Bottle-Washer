import { useState, type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronUp,
  RotateCcw,
  X,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import { useDemo, usePage, selectScene, resetDemo } from './react';
import { scenes, scenesForOperations } from './catalog';
import { demoEngine } from './engine';

export default function ScenarioConsole({
  onClose,
  tools,
}: {
  onClose: () => void;
  tools: ReactNode;
}) {
  const page = usePage();
  const { active, lastEvent } = useDemo();
  const [collapsed, setCollapsed] = useState(false);
  const [retry, setRetry] = useState<'success' | 'failure'>('success');
  const options = page.operations.length
    ? [
        ...scenesForOperations(page.operations),
        ...scenes.filter((scene) => scene.stage === 'global'),
      ]
    : [];
  return (
    <section className="tool-panel console-panel" aria-label="异常控制台">
      <header>
        <Activity size={16} />
        <h2>本页异常</h2>
        <button
          title={collapsed ? '展开控制台' : '折叠控制台'}
          aria-label={collapsed ? '展开控制台' : '折叠控制台'}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
        <button title="隐藏控制台" aria-label="隐藏控制台" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      {tools}
      {!collapsed && (
        <div className="tool-body">
          <div className="tool-kicker">当前环节</div>
          <h3>{page.title}</h3>
          <label className="tool-field">
            异常场景
            <select
              aria-label="异常场景"
              value={
                options.some((s) => s.id === active?.scene?.id)
                  ? active?.scene?.id
                  : ''
              }
              disabled={!page.operations.length}
              onChange={(e) =>
                selectScene(e.target.value, page.operations, retry)
              }
            >
              <option value="">正常</option>
              {options.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {!page.operations.length && (
            <p className="tool-muted">本页没有模拟请求或保存操作。</p>
          )}
          <label className="tool-field">
            重试结果
            <select
              aria-label="重试结果"
              value={active?.injection?.retry ?? retry}
              onChange={(e) => {
                const value = e.target.value as typeof retry;
                setRetry(value);
                demoEngine.setRetry(value);
              }}
            >
              <option value="success">重试成功</option>
              <option value="failure">重试仍失败</option>
            </select>
          </label>
          <div className={`tool-status ${active?.scene ? 'has-scene' : ''}`}>
            <strong>{active?.scene?.name ?? '正常模式'}</strong>
            <p>{active?.scene?.message ?? '未注入异常'}</p>
            {active?.scene && <p>{active.scene.recovery}</p>}
          </div>
          {active && (
            <div className="tool-actions">
              {active.status !== 'loading' && (
                <button onClick={demoEngine.retry}>重试</button>
              )}
              {active.status === 'loading' && active.preview && (
                <button
                  onClick={() => {
                    const request = active.request;
                    demoEngine.normal();
                    demoEngine.run(request);
                  }}
                >
                  恢复连接
                </button>
              )}
              {active.request.edit && (
                <button onClick={() => active.request.edit?.()}>
                  返回修改
                </button>
              )}
              <button onClick={demoEngine.normal}>取消操作</button>
            </div>
          )}
          <div className="tool-divider" />
          <div className="reset-actions">
            <button onClick={demoEngine.normal}>
              <CheckCircle2 size={15} />
              恢复正常
            </button>
            <button onClick={() => resetDemo(page.stage)}>
              <RotateCcw size={15} />
              重置当前环节
            </button>
          </div>
          <p className="tool-event" aria-live="polite">
            {lastEvent}
          </p>
        </div>
      )}
    </section>
  );
}
