import { useLayoutEffect, type ReactNode } from "react";
import { isApp } from '../runtime';
import './device.css';

interface IPhoneFrameProps {
  children: ReactNode;
  background?: string;
  statusBarColor?: string;
}

const IPhoneFrame = ({ children, background = "transparent", statusBarColor = "#000000" }: IPhoneFrameProps) => {
  useLayoutEffect(() => {
    if (!isApp) return;
    const root = document.documentElement;
    const screenBackground = background === 'transparent' ? '#edf3fa' : background;
    const colors = screenBackground.match(/#[\da-f]{3,8}/ig) ?? ['#edf3fa'];
    root.style.setProperty('--app-screen-background', screenBackground);
    root.style.setProperty('--app-screen-edge-color', colors.at(-1)!);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors[0]);
    return () => {
      root.style.removeProperty('--app-screen-background');
      root.style.removeProperty('--app-screen-edge-color');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#edf3fa');
    };
  }, [background]);
  if (isApp) return <div data-app-screen data-device-screen className="app-screen" style={{ background }}>
    <div data-connector="content" className="device-content">{children}</div>
  </div>;
  return (
    <div data-device-frame className="relative mx-auto" style={{ width: 393, height: 852 }}>
      {/* Outer device frame - titanium border */}
      <div
        data-device-chrome
        className="absolute inset-0 rounded-[55px]"
        style={{
          background: "linear-gradient(145deg, #3a3a3c, #1c1c1e)",
          boxShadow:
            "12px 12px 24px hsl(330 10% 85% / 0.3), -12px -12px 24px hsl(0 0% 100% / 0.9), inset 0 0 2px hsl(0 0% 100% / 0.1)",
        }}
      />

      {/* Side buttons - silent switch */}
      <div
        data-device-chrome
        className="absolute rounded-l-sm"
        style={{
          left: -2,
          top: 135,
          width: 3,
          height: 18,
          background: "linear-gradient(90deg, #2a2a2c, #3a3a3c)",
        }}
      />
      {/* Side buttons - volume up */}
      <div
        data-device-chrome
        className="absolute rounded-l-sm"
        style={{
          left: -2,
          top: 180,
          width: 3,
          height: 30,
          background: "linear-gradient(90deg, #2a2a2c, #3a3a3c)",
        }}
      />
      {/* Side buttons - volume down */}
      <div
        data-device-chrome
        className="absolute rounded-l-sm"
        style={{
          left: -2,
          top: 225,
          width: 3,
          height: 30,
          background: "linear-gradient(90deg, #2a2a2c, #3a3a3c)",
        }}
      />

      {/* Inner bezel */}
      <div
        data-device-chrome
        className="absolute rounded-[50px]"
        style={{
          inset: 4,
          background: "#0a0a0a",
        }}
      />

      {/* Screen area */}
      <div
        data-device-screen className="absolute overflow-hidden rounded-[46px]"
        style={{
          inset: 8,
          background: background || '#FFFFFF',
        }}
      >
        {/* Dynamic Island */}
        <div className="absolute top-[11px] left-1/2 z-30 -translate-x-1/2">
          <div
            className="rounded-full bg-black"
            style={{
              width: 126,
              height: 37,
            }}
          />
        </div>

        {/* Status bar */}
        <div className="device-status-bar relative z-10 flex items-center justify-between px-8">
          <span
            className="text-[17px] font-semibold leading-none"
            style={{ color: statusBarColor, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}
          >
            7:41
          </span>
          <div className="flex items-center gap-[5px]">
            {/* Signal bars */}
            <svg width="17" height="12" viewBox="0 0 17 12" fill="none">
              <rect x="0" y="9" width="3" height="3" rx="0.5" fill={statusBarColor} />
              <rect x="4.5" y="6" width="3" height="6" rx="0.5" fill={statusBarColor} />
              <rect x="9" y="3" width="3" height="9" rx="0.5" fill={statusBarColor} />
              <rect x="13.5" y="0" width="3" height="12" rx="0.5" fill={statusBarColor} />
            </svg>
            {/* WiFi */}
            <svg width="17" height="12" viewBox="0 0 20 16" fill="none">
              <circle cx="10" cy="14.5" r="1.8" fill={statusBarColor} />
              <path d="M5.05 9.55 A7 7 0 0 1 14.95 9.55" stroke={statusBarColor} strokeWidth="3" strokeLinecap="round" />
              <path d="M1.51 6.01 A12 12 0 0 1 18.49 6.01" stroke={statusBarColor} strokeWidth="3" strokeLinecap="round" />
            </svg>
            {/* Battery */}
            <svg width="27" height="13" viewBox="0 0 27 13" fill="none">
              <rect x="0.5" y="0.5" width="22" height="12" rx="2.5" stroke={statusBarColor} strokeOpacity="0.35" />
              <rect x="2" y="2" width="19" height="9" rx="1.5" fill={statusBarColor} />
              <path d="M24 4.5v4a2 2 0 000-4z" fill={statusBarColor} fillOpacity="0.4" />
            </svg>
          </div>
        </div>

        {/* Screens own their scroll areas; overlays stay inside the device. */}
        <div data-connector="content" className="device-content">
          {children}
        </div>

        {/* Home indicator */}
        <div data-home-indicator className="pointer-events-none absolute bottom-2 left-1/2 z-[60] -translate-x-1/2">
          <div
            className="rounded-full"
            style={{
              width: 134,
              height: 5,
              backgroundColor: statusBarColor,
              opacity: 0.25,
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default IPhoneFrame;
