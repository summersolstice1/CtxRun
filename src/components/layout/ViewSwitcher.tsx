import {
  useEffect,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { Menu, MenuItem } from '@spaceymonk/react-radial-menu';
import { useTranslation } from 'react-i18next';
import {
  APP_NAVIGATION_ITEMS,
  type PrimaryAppView,
} from '@/lib/app-navigation';
import { cn } from '@/lib/utils';

const INNER_RADIUS = 86;
const OUTER_RADIUS = 238;
const CENTER_BUTTON_SIZE = 172;

function polarToCartesian(radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: Math.cos(radians) * radius,
    y: Math.sin(radians) * radius,
  };
}

interface ViewSwitcherProps {
  activeView: PrimaryAppView;
  onSelect: (view: PrimaryAppView) => void;
}

interface ViewportSize {
  width: number;
  height: number;
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
        'flex h-full w-full select-none flex-col items-center justify-center gap-2 px-3 text-center transition-all duration-150',
        highlighted ? 'text-white' : 'text-foreground/90',
      )}
      style={{ transform: `rotate(${contentRotation}deg)` }}
    >
      <div className="flex items-center gap-1.5 text-[11px] leading-none text-white/65">
        <Icon size={13} style={{ color: item.accentColor }} />
        <span className="font-mono">Alt+{item.hotkey}</span>
      </div>
      <div className="text-[15px] font-semibold leading-5 tracking-tight">
        {label}
      </div>
    </div>
  );
}

export function ViewSwitcher({ activeView, onSelect }: ViewSwitcherProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredView, setHoveredView] = useState<PrimaryAppView | null>(null);
  const [viewport, setViewport] = useState<ViewportSize>(() => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  }));

  const activeItem =
    APP_NAVIGATION_ITEMS.find((item) => item.id === activeView) ?? APP_NAVIGATION_ITEMS[0];
  const ActiveIcon = activeItem.icon;
  const previewView = hoveredView ?? activeView;
  const previewItem =
    APP_NAVIGATION_ITEMS.find((item) => item.id === previewView) ?? activeItem;
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
    ['--__reactRadialMenu__animation-delay']: '160ms',
  };

  const updateHoveredView = (view: PrimaryAppView | null) => {
    setHoveredView(view);
  };

  const closeOverlay = () => {
    setIsOpen(false);
    updateHoveredView(null);
  };

  const selectView = (view: PrimaryAppView) => {
    if (view !== activeView) {
      onSelect(view);
    }

    closeOverlay();
  };

  useEffect(() => {
    closeOverlay();
  }, [activeView]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') {
      return;
    }

    const syncViewport = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeOverlay();
      }
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

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
                transition: fill 160ms ease, stroke 160ms ease;
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
              className="absolute inset-0 bg-background/58 backdrop-blur-[6px] outline-none focus:outline-none focus-visible:outline-none"
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
                  animationTimeout={160}
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
                        onMouseEnter={() => updateHoveredView(item.id)}
                        onMouseLeave={() => {
                          if (hoveredView === item.id) updateHoveredView(null);
                        }}
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
                  <div className="flex max-w-[9.5rem] flex-col items-center px-5">
                    <PreviewIcon size={24} style={{ color: previewItem.accentColor }} />
                    <div className="mt-3 text-[18px] font-semibold tracking-tight text-foreground">
                      {t(`menu.${previewItem.id}`)}
                    </div>
                    <div className="mt-2 text-[11px] leading-5 text-muted-foreground">
                      {t('topbar.dragHint')}
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
        onClick={() => setIsOpen((open) => !open)}
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
