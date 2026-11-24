export interface MobileViewport {
  layoutHeight: number;
  visualHeight: number;
  visualTop: number;
  scale: number;
  standalone: boolean;
  editing: boolean;
  screenHeight: number;
  screenWidth: number;
  layoutWidth: number;
  nativeSafeTop: number;
  previousReservedTop: number;
}

export function resolveMobileViewport(viewport: MobileViewport) {
  const visualHeight = viewport.visualHeight > 0 ? viewport.visualHeight : viewport.layoutHeight;
  const zoomed = Math.abs(viewport.scale - 1) > .01;
  const keyboard = !zoomed && viewport.editing && viewport.layoutHeight - visualHeight > 120;
  const useVisual = !zoomed && (!viewport.standalone || keyboard);
  const height = useVisual ? visualHeight : viewport.layoutHeight;
  const top = useVisual ? Math.max(0, Math.min(viewport.visualTop, viewport.layoutHeight - height)) : 0;
  // Some installed iOS shells already reserve the status bar but still report its CSS inset.
  const statusBarReserved = viewport.standalone && viewport.nativeSafeTop > 0
    && Math.abs(viewport.screenWidth - viewport.layoutWidth) < 2
    && Math.abs(viewport.screenHeight - viewport.layoutHeight - viewport.nativeSafeTop) < 2;
  const reservedTop = keyboard ? viewport.previousReservedTop : statusBarReserved ? viewport.nativeSafeTop : 0;
  return { height, top, reservedTop };
}
