import { Monitor, Smartphone } from 'lucide-react';
import { isApp, switchExperience } from '../runtime';
import './preview.css';

export default function PreviewSwitcher() {
  return <div className="preview-switcher" role="group" aria-label="预览版本">
    <button type="button" aria-pressed={!isApp} title="PC 版" onClick={() => { if (isApp) switchExperience('demo'); }}><Monitor size={15} /><span>PC 版</span></button>
    <button type="button" aria-pressed={isApp} title="移动版" onClick={() => { if (!isApp) switchExperience('app'); }}><Smartphone size={15} /><span>移动版</span></button>
  </div>;
}
