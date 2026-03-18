import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { Menu, MenuItem } from '@spaceymonk/react-radial-menu';
import { useTranslation } from 'react-i18next';
import {
  APP_NAVIGATION_ITEMS,
  isEditableTarget,
  type PrimaryAppView,
} from '@/lib/app-navigation';
import { cn } from '@/lib/utils';

const INNER_RADIUS = 86;
const OUTER_RADIUS = 238;
const CENTER_BUTTON_SIZE = 172;
const HOLD_OPEN_DELAY_MS = 120;
const POINTER_DEAD_ZONE = Math.max(32, INNER_RADIUS - 18);

function polarToCartesian(radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: Math.cos(radians) * radius,
    y: Math.sin(radians) * radius,
  };
}

export interface ViewportSize {
  width: number;
  height: number;
}

interface PointerPosition {
  x: number;
  y: number;
}

interface ViewSwitcherProps {
  activeView: PrimaryAppView;
  onSelect: (view: PrimaryAppView) => void;
  enableHoldShortcut?: boolean;
}

type ViewSwitcherOpenMode = 'button' | 'hold';

function getWindowViewport(): ViewportSize {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export function getViewSwitcherGeometry(itemCount: number) {
  const safeItemCount = Math.max(itemCount, 1);
  const sectorAngle = 360 / safeItemCount;
  const menuRotation = -90 - sectorAngle / 2;

  return {
    sectorAngle,
    menuRotation,
    contentRotation: -menuRotation,
  };
}

export function resolveViewSwitcherSelection(
  pointer: PointerPosition,
  viewport: ViewportSize,
  itemCount = APP_NAVIGATION_ITEMS.length,
): PrimaryAppView | null {
  if (viewport.width <= 0 || viewport.height <= 0 || itemCount <= 0) {
    return null;
  }

  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;
  const deltaX = pointer.x - centerX;
  const deltaY = pointer.y - centerY;

  if (Math.hypot(deltaX, deltaY) < POINTER_DEAD_ZONE) {
    return null;
  }

  const { sectorAngle, menuRotation } = getViewSwitcherGeometry(itemCount);
  const angle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
  const normalizedAngle = (angle - menuRotation + 360) % 360;
  const index = Math.floor(normalizedAngle / sectorAngle) % itemCount;

  return APP_NAVIGATION_ITEMS[index]?.id ?? null;
}

function MenuItemContent({
  item,
  label,
  highlighted,
  contentRotation,
}: {
  item: (typeof APP_NAVIGATION_ITEMS)[number];
  label: string;
  highlighted: boolean;
  contentRotation: number;
}) {
  const Icon = item.icon;

  return (
    <div
      className={cn(
        'flex h-full w-full select-none flex-col items-center justify-center gap-3 px-3 text-center transition-all duration-150',
        highlighted ? 'text-white' : 'text-foreground/90',
      )}
      style={{ transform: `rotate(${contentRotation}deg)` }}
    >
      <div
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full border transition-colors duration-150',
          highlighted
            ? 'border-white/22 bg-white/10 text-white'
            : 'border-white/10 bg-white/5 text-white/80',
        )}
      >
        <Icon size={16} style={{ color: item.accentColor }} />
      </div>
      <div className="text-[15px] font-semibold leading-5 tracking-tight">
        {label}
      </div>
    </div>
  );
}

export function ViewSwitcher({
  activeView,
  onSelect,
  enableHoldShortcut = true,
}: ViewSwitcherProps) {
  const { t } = useTranslation();
  const [openMode, setOpenMode] = useState<ViewSwitcherOpenMode | null>(null);
  const [previewView, setPreviewView] = useState<PrimaryAppView | null>(null);
  const [viewport, setViewport] = useState<ViewportSize>(() => getWindowViewport());
  const openModeRef = useRef<ViewSwitcherOpenMode | null>(null);
  const activeViewRef = useRef(activeView);
  const previewViewRef = useRef<PrimaryAppView | null>(null);
  const viewportRef = useRef(viewport);
  const pointerRef = useRef<PointerPosition | null>(null);
  const holdPendingRef = useRef(false);
  const holdBlockedRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const isOpen = openMode !== null;
  const isHoldMode = openMode === 'hold';

  const activeItem =
    APP_NAVIGATION_ITEMS.find((item) => item.id === activeView) ?? APP_NAVIGATION_ITEMS[0];
  const previewItem =
    APP_NAVIGATION_ITEMS.find((item) => item.id === (previewView ?? activeView)) ?? activeItem;
  const ActiveIcon = activeItem.icon;
  const PreviewIcon = previewItem.icon;
  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;
  const { sectorAngle, menuRotation, contentRotation } = getViewSwitcherGeometry(APP_NAVIGATION_ITEMS.length);

  const menuStyle: CSSProperties & Record<string, string | number> = {
    ['--__reactRadialMenu__menu-bgColor']: 'rgba(16, 20, 31, 0.96)',
    ['--__reactRadialMenu__separator-color']: 'rgba(255,255,255,0.12)',
    ['--__reactRadialMenu__item-color']: '#f8fafc',
    ['--__reactRadialMenu__activeItem-color']: '#ffffff',
    ['--__reactRadialMenu__activeItem-bgColor']: 'rgba(255,255,255,0.08)',
    ['--__reactRadialMenu__zIndex']: 4,
    ['--__reactRadialMenu__animation-delay']: '140ms',
  };

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const closeOverlay = useCallback(() => {
    setOpenMode(null);
    setPreviewView(null);
  }, []);

  const openOverlay = useCallback((mode: ViewSwitcherOpenMode) => {
    const nextViewport = getWindowViewport();
    viewportRef.current = nextViewport;
    setViewport(nextViewport);
    setOpenMode(mode);
    setPreviewView(
      pointerRef.current
        ? resolveViewSwitcherSelection(pointerRef.current, nextViewport)
        : null,
    );
  }, []);

  const selectView = useCallback((view: PrimaryAppView) => {
    if (view !== activeViewRef.current) {
      onSelect(view);
    }

    closeOverlay();
  }, [closeOverlay, onSelect]);

  const cancelHoldSession = useCallback(() => {
    clearHoldTimer();
    holdPendingRef.current = false;
    holdBlockedRef.current = false;

    if (openModeRef.current === 'hold') {
      closeOverlay();
    }
  }, [clearHoldTimer, closeOverlay]);

  const commitHoldSelection = useCallback(() => {
    const selectedView = previewViewRef.current;
    if (selectedView && selectedView !== activeViewRef.current) {
      onSelect(selectedView);
    }

    closeOverlay();
  }, [closeOverlay, onSelect]);

  useEffect(() => {
    openModeRef.current = openMode;
  }, [openMode]);

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  useEffect(() => {
    previewViewRef.current = previewView;
  }, [previewView]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    closeOverlay();
  }, [activeView, closeOverlay]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const point = { x: event.clientX, y: event.clientY };
      pointerRef.current = point;

      if (!openModeRef.current) {
        return;
      }

      setPreviewView(resolveViewSwitcherSelection(point, viewportRef.current));
    };

    const handleResize = () => {
      const nextViewport = getWindowViewport();
      viewportRef.current = nextViewport;
      setViewport(nextViewport);

      if (!openModeRef.current) {
        return;
      }

      setPreviewView(
        pointerRef.current
          ? resolveViewSwitcherSelection(pointerRef.current, nextViewport)
          : null,
      );
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (holdPendingRef.current || openModeRef.current) {
          event.preventDefault();
        }

        clearHoldTimer();
        holdPendingRef.current = false;
        holdBlockedRef.current = false;

        if (openModeRef.current) {
          closeOverlay();
        }

        return;
      }

      if (!enableHoldShortcut) {
        return;
      }

      if (event.key === 'Alt') {
        if (event.repeat || event.ctrlKey || event.metaKey || event.shiftKey) {
          return;
        }

        if (holdPendingRef.current || openModeRef.current) {
          return;
        }

        if (isEditableTarget(event.target) || isEditableTarget(document.activeElement)) {
          return;
        }

        event.preventDefault();
        holdBlockedRef.current = false;
        holdPendingRef.current = true;
        clearHoldTimer();
        holdTimerRef.current = window.setTimeout(() => {
          if (!holdPendingRef.current || holdBlockedRef.current || openModeRef.current === 'button') {
            return;
          }

          openOverlay('hold');
        }, HOLD_OPEN_DELAY_MS);
        return;
      }

      if (event.altKey && (holdPendingRef.current || openModeRef.current === 'hold')) {
        holdBlockedRef.current = true;
        holdPendingRef.current = false;
        clearHoldTimer();

        if (openModeRef.current === 'hold') {
          closeOverlay();
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Alt') {
        return;
      }

      if (holdPendingRef.current || openModeRef.current === 'hold') {
        event.preventDefault();
      }

      clearHoldTimer();
      holdPendingRef.current = false;

      if (openModeRef.current === 'hold' && !holdBlockedRef.current) {
        commitHoldSelection();
      }

      holdBlockedRef.current = false;
    };

    const handleWindowBlur = () => {
      clearHoldTimer();
      holdPendingRef.current = false;
      holdBlockedRef.current = false;

      if (openModeRef.current) {
        closeOverlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [clearHoldTimer, closeOverlay, commitHoldSelection, enableHoldShortcut, openOverlay]);

  useEffect(() => {
    if (enableHoldShortcut) {
      return;
    }

    cancelHoldSession();
  }, [cancelHoldSession, enableHoldShortcut]);

  const overlay =
    typeof document === 'undefined' || !isOpen
      ? null
      : createPortal(
        <div className="fixed inset-0 z-[80]">
          <style>{`
            .ctxrun-radial-menu {
              transform: rotate(${menuRotation}deg);
            }

            .ctxrun-radial-menu .ctxrun-menu-item .__rrm-base {
              fill: rgba(16, 20, 31, 0.96);
              stroke: rgba(255, 255, 255, 0.12);
              transition: fill 140ms ease, stroke 140ms ease;
            }

            .ctxrun-radial-menu .ctxrun-menu-item.ctxrun-force-active .__rrm-base {
              fill: rgba(255, 255, 255, 0.08);
              stroke: rgba(255, 255, 255, 0.24);
            }

            .ctxrun-radial-menu .ctxrun-menu-item .__rrm-content {
              color: rgba(248, 250, 252, 0.82);
            }

            .ctxrun-radial-menu .ctxrun-menu-item.ctxrun-force-active .__rrm-content {
              color: rgba(255, 255, 255, 0.98);
            }
          `}</style>

          <button
            type="button"
            aria-label={t('topbar.closeSwitcher')}
            className="absolute inset-0 bg-background/52 backdrop-blur-[6px] outline-none focus:outline-none focus-visible:outline-none"
            onClick={closeOverlay}
          />

          <div className="pointer-events-none absolute inset-0">
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <svg
                width={OUTER_RADIUS * 2 + 28}
                height={OUTER_RADIUS * 2 + 28}
                viewBox={`0 0 ${OUTER_RADIUS * 2 + 28} ${OUTER_RADIUS * 2 + 28}`}
                className="overflow-visible"
                aria-hidden="true"
              >
                <circle
                  cx={OUTER_RADIUS + 14}
                  cy={OUTER_RADIUS + 14}
                  r={OUTER_RADIUS + 1}
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="1.2"
                />
                {APP_NAVIGATION_ITEMS.map((item, index) => {
                  const point = polarToCartesian(OUTER_RADIUS + 1, -90 + index * sectorAngle);
                  const isHighlighted = previewView === item.id;

                  return (
                    <circle
                      key={item.id}
                      cx={OUTER_RADIUS + 14 + point.x}
                      cy={OUTER_RADIUS + 14 + point.y}
                      r={isHighlighted ? 8 : 6}
                      fill={isHighlighted ? item.accentColor : 'rgba(21,31,57,0.95)'}
                      stroke="rgba(255,255,255,0.22)"
                      strokeWidth="1.5"
                    />
                  );
                })}
              </svg>
            </div>

            <div className="pointer-events-none absolute inset-0">
              <Menu
                centerX={centerX}
                centerY={centerY}
                innerRadius={INNER_RADIUS}
                outerRadius={OUTER_RADIUS}
                show
                animation={['fade', 'scale']}
                animationTimeout={140}
                theme="dark"
                drawBackground
                style={menuStyle}
                className="ctxrun-radial-menu"
              >
                {APP_NAVIGATION_ITEMS.map((item) => {
                  const isHighlighted = previewView === item.id;

                  return (
                    <MenuItem
                      key={item.id}
                      className={cn('ctxrun-menu-item pointer-events-auto', isHighlighted && 'ctxrun-force-active')}
                      data={item.id}
                      onItemClick={(_, __, data) => selectView(data as PrimaryAppView)}
                    >
                      <MenuItemContent
                        item={item}
                        label={t(`menu.${item.id}`)}
                        highlighted={isHighlighted}
                        contentRotation={contentRotation}
                      />
                    </MenuItem>
                  );
                })}
              </Menu>
            </div>

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className="flex items-center justify-center rounded-full border border-white/10 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.06),rgba(255,255,255,0.015)_48%,rgba(7,10,18,0.96)_100%)] text-center shadow-[0_20px_48px_rgba(0,0,0,0.34)] backdrop-blur-sm"
                style={{
                  width: `${CENTER_BUTTON_SIZE}px`,
                  height: `${CENTER_BUTTON_SIZE}px`,
                }}
              >
                <div className="flex max-w-[9.75rem] flex-col items-center px-5">
                  <PreviewIcon size={24} style={{ color: previewItem.accentColor }} />
                  <div className="mt-3 text-[18px] font-semibold tracking-tight text-foreground">
                    {t(`menu.${previewItem.id}`)}
                  </div>
                  <div className="mt-2 text-[11px] leading-5 text-muted-foreground">
                    {previewView
                      ? isHoldMode
                        ? t('topbar.releaseHint')
                        : t('topbar.clickHint')
                      : t('topbar.moveHint')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      );

  return (
    <>
      <button
        type="button"
        title={isOpen ? t('topbar.closeSwitcher') : t('topbar.openSwitcher')}
        onClick={() => {
          cancelHoldSession();

          if (openModeRef.current === 'button') {
            closeOverlay();
            return;
          }

          openOverlay('button');
        }}
        className={cn(
          'group flex h-7 max-w-[136px] items-center gap-1.5 rounded-full border px-2.5 text-xs outline-none transition-all duration-150 focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 focus-visible:border-primary/35',
          isOpen
            ? 'border-white/10 bg-secondary/45 text-foreground shadow-[0_8px_20px_rgba(0,0,0,0.14)]'
            : 'border-border/45 bg-secondary/18 text-muted-foreground hover:border-border/70 hover:bg-secondary/28 hover:text-foreground',
        )}
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center" style={{ color: activeItem.accentColor }}>
          <ActiveIcon size={14} />
        </span>
        <span className="truncate text-[11px] font-medium tracking-wide text-foreground/90">
          {t(`menu.${activeView}`)}
        </span>
        <ChevronDown size={11} className={cn('shrink-0 transition-transform duration-150', isOpen && 'rotate-180')} />
      </button>
      {overlay}
    </>
  );
}
