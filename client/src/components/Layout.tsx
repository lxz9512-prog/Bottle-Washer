import { Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Activity, Cable, ListTree, Moon, RotateCcw, Sun, X, Smartphone, SlidersHorizontal } from 'lucide-react';
import { entryPath } from '../runtime';
import { QRCodeSVG } from 'qrcode.react';
import '../demo/tools.css';
import ScenarioConsole from '../demo/Console';
import { RouteBoundary, resetDemo, setDemoPage, usePage, useDemo } from '../demo/react';
import { demoEngine } from '../demo/engine';
import { pages } from '../demo/catalog';
import { demoLocal } from '../demo/storage';
import { cleaningMachineStore } from '../pages/DemoShowcasePage/cleaning-machine-store';
import { useLocale } from '../pages/DemoShowcasePage/useLocale';
import { useDarkMode } from '../pages/DemoShowcasePage/useDarkMode';
import { useMachineClock } from '../pages/DemoShowcasePage/useMachineClock';
import { getMachineModel, machinePath, supportsMode } from '../pages/DemoShowcasePage/machine-models';
import PreviewSwitcher from './PreviewSwitcher';
import InteractionNotes from '../demo/InteractionNotes';

const directory = ['devices', 'home', 'custom-mode', 'smart-mode', 'run-control', 'settings', 'consumables', 'device-info', 'baby-items', 'other-settings', 'notifications'];
export default function Layout() {
  const machine = useMachineClock();
  const model = getMachineModel();
  const navigate = useNavigate();
  const page = usePage();
  const { revision } = useDemo();
  const { locale, setLocale } = useLocale();
  const { darkMode, toggleDarkMode } = useDarkMode();
  const [directoryOpen, setDirectoryOpen] = useState(() => window.innerWidth >= 1200);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [globalOpen, setGlobalOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(() => window.innerWidth >= 1200);
  const [connectors, setConnectors] = useState(() => demoLocal.get('connectors', true));
  const [showPhoneFrame, setShowPhoneFrame] = useState(() => demoLocal.get('show-phone-frame', true));
  const [paths, setPaths] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement>(null);
  const [phoneScale, setPhoneScale] = useState(1);
  const launcher = useRef<HTMLButtonElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const shareDialog = useRef<HTMLDialogElement>(null);
  const mobileUrl = new URL(page.id === 'devices' ? '#/app' : `#/app/cleaning-machine/models/${model.id}/home`, window.location.href);
  if (import.meta.env.DEV && import.meta.env.DEV_LAN_HOST && ['localhost', '127.0.0.1', '[::1]'].includes(mobileUrl.hostname)) mobileUrl.hostname = import.meta.env.DEV_LAN_HOST;
  const appUrl = mobileUrl.href;
  useEffect(() => {
    if (shareOpen) shareDialog.current?.showModal();
  }, [shareOpen]);
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const fit = () => {
      const headerHeight = root.current?.querySelector('.workspace-header')?.getBoundingClientRect().height ?? 60;
      root.current?.style.setProperty('--workspace-header-height', `${headerHeight}px`);
      const availableHeight = Math.max(1, window.innerHeight - headerHeight - 48);
      setPhoneScale(Math.min(1, Math.max(1, window.innerWidth - 24) / 393, availableHeight / 852));
    };
    let frame = 0;
    const scheduleFit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    const observer = new ResizeObserver(scheduleFit);
    observer.observe(element);
    const header = root.current?.querySelector('.workspace-header');
    if (header) observer.observe(header);
    window.addEventListener('resize', scheduleFit);
    fit();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', scheduleFit); };
  }, []);
  useEffect(() => {
    const compact = window.matchMedia('(max-width: 1199px)');
    const change = () => {
      if (compact.matches) { setDirectoryOpen(false); setConsoleOpen(false); setGlobalOpen(false); setInfoOpen(false); }
    };
    compact.addEventListener('change', change);
    return () => compact.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    setConnectors(demoLocal.get('connectors', true));
    setShowPhoneFrame(demoLocal.get('show-phone-frame', true));
  }, [revision]);
  const closeConsole = () => { setConsoleOpen(false); requestAnimationFrame(() => launcher.current?.focus()); };
  const go = (id: string) => {
    demoEngine.normal();
    if (id === 'devices' || id === 'notifications') navigate(entryPath(id === 'devices' ? '/' : '/notifications'));
    else {
      cleaningMachineStore.set({ activeScreen: id });
      navigate(machinePath(id));
    }
    setDemoPage(id);
    if (window.innerWidth < 1200) setDirectoryOpen(false);
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { closeConsole(); setGlobalOpen(false); setDirectoryOpen(false); setInfoOpen(false); setShareOpen(false); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const update = () => {
      if (!connectors || !infoOpen || window.innerWidth < 1200) { setPaths([]); return; }
      const base = element.getBoundingClientRect();
      const lines: string[] = [];
      element.querySelectorAll<HTMLElement>('[data-note-target]').forEach(source => {
        const target = element.querySelector<HTMLElement>(`[data-connector="${source.dataset.noteTarget}"]`);
        if (!target) return;
        const a = source.getBoundingClientRect();
        const b = target.getBoundingClientRect();
        if (!a.width || !b.width) return;
        const x = a.left - base.left, y = a.top + a.height / 2 - base.top;
        const tx = b.right - base.left, ty = b.top + b.height / 2 - base.top;
        lines.push(`M ${x} ${y} C ${x - 38} ${y}, ${tx + 38} ${ty}, ${tx} ${ty}`);
      });
      setPaths(lines);
    };
    const frame = requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    const infoBody = element.querySelector('.info-panel .tool-body');
    if (infoBody) observer.observe(infoBody);
    element.querySelectorAll('[data-device-frame], [data-note-target]').forEach(node => observer.observe(node));
    window.addEventListener('resize', update);
    element.addEventListener('scroll', update, true);
    const timer = setTimeout(update, 350);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); observer.disconnect(); window.removeEventListener('resize', update); element.removeEventListener('scroll', update, true); };
  }, [page.id, directoryOpen, consoleOpen, infoOpen, connectors, revision]);
  return (
    <div className="demo-workspace" ref={root}>
      <div className="workspace-header">
        <strong>清洗机系列</strong>
        <span>{page.title}</span>
        <PreviewSwitcher />
        <nav aria-label="演示面板">
          <button
            title="手机体验"
            aria-label="手机体验二维码"
            onClick={() => setShareOpen(true)}
          >
            <Smartphone size={18} />
          </button>
          <button
            title="全局控制台"
            aria-label="打开全局控制台"
            aria-pressed={globalOpen}
            onClick={() => {
              setGlobalOpen(!globalOpen);
              setConsoleOpen(false);
            }}
          >
            <SlidersHorizontal size={18} />
            <span>全局</span>
          </button>
          <button
            ref={launcher}
            title="本页异常"
            aria-label="打开异常控制台"
            aria-pressed={consoleOpen}
            onClick={() => {
              setConsoleOpen(!consoleOpen);
              setGlobalOpen(false);
            }}
          >
            <Activity size={18} />
            <span>本页异常</span>
          </button>
        </nav>
      </div>
      <div className="workspace-grid">
        <aside
          className="tool-panel side-rail directory-panel"
          data-open={directoryOpen}
          inert={!directoryOpen}
          aria-hidden={!directoryOpen}
          aria-label="页面目录"
        >
          <header>
            <ListTree size={16} />
            <h2>页面目录</h2>
            <button
              title="关闭目录"
              aria-label="关闭目录"
              onClick={() => setDirectoryOpen(false)}
            >
              <X size={16} />
            </button>
          </header>
          <nav>
            {directory
              .filter((id) => id !== 'smart-mode' || supportsMode('smart'))
              .map((id) => (
                <button
                  key={id}
                  className={page.id === id ? 'selected' : ''}
                  onClick={() => go(id)}
                >
                  {pages[id].title}
                </button>
              ))}
          </nav>
        </aside>
        {globalOpen && (
          <section className="tool-panel global-panel" aria-label="全局控制台">
            <header>
              <SlidersHorizontal size={16} />
              <h2>全局控制台</h2>
              <button
                aria-label="关闭全局控制台"
                onClick={() => setGlobalOpen(false)}
              >
                <X size={16} />
              </button>
            </header>
            <div
              className="console-toolbar"
              role="toolbar"
              aria-label="演示工具"
            >
              <div className="tool-segments" aria-label="语言">
                <button
                  aria-pressed={locale === 'zh'}
                  onClick={() => setLocale('zh')}
                >
                  中
                </button>
                <button
                  aria-pressed={locale === 'en'}
                  onClick={() => setLocale('en')}
                >
                  EN
                </button>
              </div>
              <button
                title="切换深色模式"
                aria-label="切换深色模式"
                aria-pressed={darkMode}
                onClick={() => toggleDarkMode(!darkMode)}
              >
                {darkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                title="交互连线"
                aria-label="交互连线"
                aria-pressed={connectors}
                onClick={() => {
                  const next = !connectors;
                  demoLocal.set('connectors', next);
                  setConnectors(next);
                }}
              >
                <Cable size={18} />
              </button>
              <button
                title="重置整个 Demo"
                aria-label="重置整个 Demo"
                onClick={() => {
                  resetDemo();
                  setConnectors(true);
                }}
              >
                <RotateCcw size={18} />
              </button>
              <label className="phone-frame-toggle">
                <span>显示手机边框</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={showPhoneFrame}
                  onChange={(event) => {
                    const next = event.target.checked;
                    demoLocal.set('show-phone-frame', next);
                    setShowPhoneFrame(next);
                  }}
                />
              </label>
              <label className="phone-frame-toggle">
                <span>页面目录</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={directoryOpen}
                  onChange={(event) => {
                    setDirectoryOpen(event.target.checked);
                  }}
                />
              </label>
              <label className="phone-frame-toggle">
                <span>交互说明</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={infoOpen}
                  onChange={(event) => {
                    setInfoOpen(event.target.checked);
                  }}
                />
              </label>
            </div>
          </section>
        )}
        {consoleOpen && (
          <ScenarioConsole
            onClose={closeConsole}
            tools={
              page.id !== 'devices' && page.id !== 'notifications' ? (
                <div className="console-toolbar">
                  {' '}
                  <label className="phone-frame-toggle">
                    <span>设备设计状态</span>
                    <select
                      aria-label="设备设计状态"
                      value={machine.presentation}
                      onChange={(event) =>
                        cleaningMachineStore.set({
                          presentation: event.target
                            .value as typeof machine.presentation,
                        })
                      }
                    >
                      <option value="normal">正常</option>
                      <option value="offline">设备离线</option>
                      <option value="error-df">DF 故障</option>
                      <option value="error-af">AF 故障</option>
                      {(model.consumables as readonly string[]).includes(
                        'water',
                      ) && (
                        <>
                          <option value="filter-soon">软水滤芯即将到期</option>
                          <option value="filter-expired">软水滤芯已到期</option>
                        </>
                      )}
                    </select>
                  </label>
                </div>
              ) : null
            }
          />
        )}
        <main
          ref={stage}
          className="phone-stage"
          data-show-phone-frame={showPhoneFrame}
          style={{ '--phone-scale': phoneScale } as CSSProperties}
        >
          <RouteBoundary>
            <Outlet />
          </RouteBoundary>
        </main>
        <InteractionNotes
          page={page}
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
        />
      </div>
      {paths.length > 0 && (
        <svg className="interaction-lines" aria-hidden="true">
          {paths.map((d, index) => (
            <path key={index} d={d} />
          ))}
        </svg>
      )}
      {shareOpen && (
        <dialog
          ref={shareDialog}
          className="share-dialog"
          aria-label="手机体验"
          onCancel={() => setShareOpen(false)}
        >
          <header>
            <h2>手机体验</h2>
            <button
              aria-label="关闭手机体验"
              onClick={() => setShareOpen(false)}
            >
              <X size={18} />
            </button>
          </header>
          <QRCodeSVG value={appUrl} size={192} marginSize={2} />
          <a href={appUrl} target="_blank" rel="noopener">
            {appUrl}
          </a>
        </dialog>
      )}
    </div>
  );
}
