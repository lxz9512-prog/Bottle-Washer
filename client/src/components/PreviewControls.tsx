import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { QrCode, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { experienceHash } from '../runtime';
import PreviewSwitcher from './PreviewSwitcher';

export default function PreviewControls() {
  const location = useLocation();
  const [shareOpen, setShareOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const mobileUrl = new URL(window.location.href);
  mobileUrl.searchParams.delete('preview');
  mobileUrl.hash = experienceHash(
    `#${location.pathname}${location.search}`,
    'app',
  );
  if (
    import.meta.env.DEV &&
    import.meta.env.DEV_LAN_HOST &&
    ['localhost', '127.0.0.1', '[::1]'].includes(mobileUrl.hostname)
  ) {
    mobileUrl.hostname = import.meta.env.DEV_LAN_HOST;
  }
  const appUrl = mobileUrl.href;
  useEffect(() => {
    if (shareOpen) dialog.current?.showModal();
  }, [shareOpen]);
  return (
    <div className="preview-controls">
      <PreviewSwitcher />
      <button
        type="button"
        className="preview-share"
        aria-label="手机体验二维码"
        onClick={() => setShareOpen(true)}
      >
        <QrCode size={16} />
        <span>手机扫码访问</span>
      </button>
      {shareOpen && (
        <dialog
          ref={dialog}
          className="share-dialog"
          aria-label="手机体验"
          onCancel={() => setShareOpen(false)}
        >
          <header>
            <h2>手机体验</h2>
            <button
              type="button"
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
