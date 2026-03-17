import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  APP_NAVIGATION_ITEMS,
  type PrimaryAppView,
} from '@/lib/app-navigation';
import { cn } from '@/lib/utils';

const OUTER_RADIUS = 174;
const INNER_RADIUS = 78;
const NODE_RADIUS = 7;
const LABEL_RADIUS = 130;
const VIEWBOX_SIZE = 420;
const ANGLE_OFFSET = -90;

function polarToCartesian(radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: Math.cos(radians) * radius,
    y: Math.sin(radians) * radius,
  };
}

function describeSector(startAngle: number, endAngle: number, innerRadius: number, outerRadius: number) {
  const outerStart = polarToCartesian(outerRadius, startAngle);
  const outerEnd = polarToCartesian(outerRadius, endAngle);
  const innerEnd = polarToCartesian(innerRadius, endAngle);
  const innerStart = polarToCartesian(innerRadius, startAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

function getViewFromPoint(x: number, y: number): PrimaryAppView | null {
  const distance = Math.hypot(x, y);
  if (distance < INNER_RADIUS - 10 || distance > OUTER_RADIUS + 26) {
    return null;
  }

  const sectorStep = 360 / APP_NAVIGATION_ITEMS.length;
  const rawAngle = (Math.atan2(y, x) * 180) / Math.PI;
  const normalizedAngle = (rawAngle - ANGLE_OFFSET + 360 + sectorStep / 2) % 360;
  const index = Math.floor(normalizedAngle / sectorStep);
  return APP_NAVIGATION_ITEMS[index]?.id ?? null;
}

function RadialGlyph({ activeColor }: { activeColor: string }) {
  const spokeAngles = new Array(APP_NAVIGATION_ITEMS.length)
    .fill(null)
    .map((_, index) => ANGLE_OFFSET + index * (360 / APP_NAVIGATION_ITEMS.length));

  return (
    <svg viewBox="-18 -18 36 36" className="h-4 w-4" aria-hidden="true">
      <circle cx="0" cy="0" r="11.5" fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.4" />
      <circle cx="0" cy="0" r="4.5" fill="none" stroke={activeColor} strokeWidth="1.6" />
      {spokeAngles.map((angle) => {
        const innerPoint = polarToCartesian(6, angle);
        const outerPoint = polarToCartesian(11.5, angle);
        const nodePoint = polarToCartesian(14, angle);

        return (
          <g key={angle}>
            <line
              x1={innerPoint.x}
              y1={innerPoint.y}
              x2={outerPoint.x}
              y2={outerPoint.y}
              stroke="currentColor"
              strokeOpacity="0.35"
              strokeWidth="1.1"
            />
            <circle cx={nodePoint.x} cy={nodePoint.y} r="1.7" fill={activeColor} fillOpacity="0.9" />
          </g>
        );
      })}
    </svg>
  );
}

interface ViewSwitcherProps {
  activeView: PrimaryAppView;
  onSelect: (view: PrimaryAppView) => void;
  onCycle: (delta: number) => void;
}

export function ViewSwitcher({ activeView, onSelect, onCycle }: ViewSwitcherProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredView, setHoveredView] = useState<PrimaryAppView | null>(null);
  const [draggedView, setDraggedView] = useState<PrimaryAppView | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);
  const activeViewRef = useRef(activeView);
  const hoveredViewRef = useRef<PrimaryAppView | null>(null);
  const draggedViewRef = useRef<PrimaryAppView | null>(null);

  const activeItem =
    APP_NAVIGATION_ITEMS.find((item) => item.id === activeView) ?? APP_NAVIGATION_ITEMS[0];
  const previewView = draggedView ?? hoveredView ?? activeView;
  const previewItem =
    APP_NAVIGATION_ITEMS.find((item) => item.id === previewView) ?? activeItem;
  const PreviewIcon = previewItem.icon;
  const sectorStep = 360 / APP_NAVIGATION_ITEMS.length;
  const labelRadius = APP_NAVIGATION_ITEMS.length > 6 ? LABEL_RADIUS - 10 : LABEL_RADIUS;
  const labelWidth = APP_NAVIGATION_ITEMS.length > 6 ? 76 : 88;
  const labelHeight = APP_NAVIGATION_ITEMS.length > 6 ? 48 : 52;

  const updateHoveredView = (view: PrimaryAppView | null) => {
    hoveredViewRef.current = view;
    setHoveredView(view);
  };

  const updateDraggedView = (view: PrimaryAppView | null) => {
    draggedViewRef.current = view;
    setDraggedView(view);
  };

  useEffect(() => {
    if (activeViewRef.current !== activeView) {
      activeViewRef.current = activeView;
      setIsOpen(false);
      updateHoveredView(null);
      updateDraggedView(null);
      setIsDragging(false);
    }
  }, [activeView]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        updateHoveredView(null);
        updateDraggedView(null);
        setIsDragging(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const updateDragTarget = (clientX: number, clientY: number) => {
      const bounds = wheelRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }

      const nextView = getViewFromPoint(
        clientX - (bounds.left + bounds.width / 2),
        clientY - (bounds.top + bounds.height / 2),
      );

      updateDraggedView(nextView);
      updateHoveredView(nextView);
    };

    const handlePointerMove = (event: PointerEvent) => {
      updateDragTarget(event.clientX, event.clientY);
    };

    const handlePointerUp = () => {
      const nextView = draggedViewRef.current ?? hoveredViewRef.current;

      setIsDragging(false);

      if (nextView && nextView !== activeView) {
        onSelect(nextView);
        return;
      }

      updateDraggedView(null);
      updateHoveredView(null);
      setIsOpen(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [activeView, isDragging, onSelect]);

  const handleCenterPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    setIsOpen(true);
    setIsDragging(true);

    const bounds = wheelRef.current?.getBoundingClientRect();
    if (!bounds) {
      updateDraggedView(null);
      updateHoveredView(null);
      return;
    }

    const nextView = getViewFromPoint(
      event.clientX - (bounds.left + bounds.width / 2),
      event.clientY - (bounds.top + bounds.height / 2),
    );

    updateDraggedView(nextView);
    updateHoveredView(nextView);
  };

  const handleTriggerWheel = (event: ReactWheelEvent<HTMLButtonElement>) => {
    if (!event.shiftKey) {
      return;
    }

    event.preventDefault();
    onCycle(event.deltaY > 0 ? 1 : -1);
  };

  const closeOverlay = () => {
    setIsOpen(false);
    updateHoveredView(null);
    updateDraggedView(null);
    setIsDragging(false);
  };

  const selectView = (view: PrimaryAppView) => {
    if (view === activeView) {
      closeOverlay();
      return;
    }

    onSelect(view);
  };

  const overlay =
    typeof document === 'undefined' || !isOpen
      ? null
      : createPortal(
          <div className="fixed inset-0 z-[80]">
            <button
              type="button"
              aria-label={t('topbar.closeSwitcher')}
              className="absolute inset-0 bg-background/58 backdrop-blur-[5px]"
              onClick={closeOverlay}
            />

            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div
                className="relative flex h-[420px] w-[420px] items-center justify-center rounded-full"
                onClick={(event) => event.stopPropagation()}
              >
                <div
                  ref={wheelRef}
                  className="relative h-[420px] w-[420px] touch-none rounded-full"
                  style={{
                    background:
                      'radial-gradient(circle at center, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.018) 42%, rgba(255,255,255,0.01) 66%, rgba(255,255,255,0) 100%)',
                  }}
                >
                  <svg
                    viewBox={`-${VIEWBOX_SIZE / 2} -${VIEWBOX_SIZE / 2} ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
                    className="absolute inset-0 h-full w-full"
                    aria-hidden="true"
                  >
                    <circle
                      cx="0"
                      cy="0"
                      r={OUTER_RADIUS}
                      fill="none"
                      stroke="rgba(255,255,255,0.18)"
                      strokeWidth="1.35"
                    />
                    <circle
                      cx="0"
                      cy="0"
                      r={INNER_RADIUS}
                      fill="rgba(10,14,24,0.42)"
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth="1"
                    />

                    {APP_NAVIGATION_ITEMS.map((item, index) => {
                      const boundaryAngle = ANGLE_OFFSET - sectorStep / 2 + index * sectorStep;
                      const lineEnd = polarToCartesian(OUTER_RADIUS, boundaryAngle);

                      return (
                        <line
                          key={`${item.id}-boundary`}
                          x1="0"
                          y1="0"
                          x2={lineEnd.x}
                          y2={lineEnd.y}
                          stroke="rgba(255,255,255,0.12)"
                          strokeWidth="1"
                        />
                      );
                    })}

                    {APP_NAVIGATION_ITEMS.map((item, index) => {
                      const midAngle = ANGLE_OFFSET + index * sectorStep;
                      const startAngle = midAngle - sectorStep / 2;
                      const endAngle = midAngle + sectorStep / 2;
                      const isHighlighted = previewView === item.id;
                      const isActive = activeView === item.id;
                      const sectorPath = describeSector(startAngle, endAngle, INNER_RADIUS, OUTER_RADIUS);
                      const nodePoint = polarToCartesian(OUTER_RADIUS, midAngle);
                      const Icon = item.icon;
                      const labelPoint = polarToCartesian(labelRadius, midAngle);

                      return (
                        <g key={item.id}>
                          <path
                            d={sectorPath}
                            fill={item.accentColor}
                            fillOpacity={isHighlighted ? 0.18 : isActive ? 0.08 : 0}
                            stroke={isHighlighted ? 'rgba(255,255,255,0.18)' : 'transparent'}
                            strokeWidth="1"
                            pointerEvents="all"
                            className="transition-all duration-150"
                            onMouseEnter={() => updateHoveredView(item.id)}
                            onMouseLeave={() => {
                              if (hoveredViewRef.current === item.id) {
                                updateHoveredView(null);
                              }
                            }}
                            onClick={() => selectView(item.id)}
                          />
                          <circle
                            cx={nodePoint.x}
                            cy={nodePoint.y}
                            r={NODE_RADIUS}
                            fill={isHighlighted || isActive ? item.accentColor : 'rgba(15,23,42,0.92)'}
                            stroke={isHighlighted || isActive ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.24)'}
                            strokeWidth={isHighlighted || isActive ? 1.4 : 1}
                            className="transition-all duration-150"
                          />
                          {(isHighlighted || isActive) && (
                            <g transform={`translate(${nodePoint.x}, ${nodePoint.y})`}>
                              <circle
                                cx="0"
                                cy="0"
                                r={NODE_RADIUS + 10}
                                fill={item.accentColor}
                                fillOpacity="0.08"
                              />
                            </g>
                          )}
                          <foreignObject
                            x={labelPoint.x - labelWidth / 2}
                            y={labelPoint.y - labelHeight / 2}
                            width={labelWidth}
                            height={labelHeight}
                          >
                            <button
                              type="button"
                              className={cn(
                                'flex h-full w-full flex-col items-center justify-center rounded-2xl border text-center transition-all duration-150',
                                isHighlighted || isActive
                                  ? 'border-white/12 bg-background/68 shadow-[0_12px_36px_rgba(0,0,0,0.28)]'
                                  : 'border-transparent bg-transparent hover:border-white/8 hover:bg-white/[0.03]',
                              )}
                              onMouseEnter={() => updateHoveredView(item.id)}
                              onMouseLeave={() => {
                                if (hoveredViewRef.current === item.id) {
                                  updateHoveredView(null);
                                }
                              }}
                              onClick={() => selectView(item.id)}
                            >
                              <div className="mb-1 flex items-center gap-1.5 text-[10px] leading-none text-muted-foreground/85">
                                <Icon size={12} style={{ color: item.accentColor }} />
                                <span className="font-mono">Alt+{item.hotkey}</span>
                              </div>
                              <span className="truncate text-[14px] font-medium text-foreground/92">
                                {t(`menu.${item.id}`)}
                              </span>
                            </button>
                          </foreignObject>
                        </g>
                      );
                    })}
                  </svg>

                  <div className="absolute inset-0 flex items-center justify-center">
                    <button
                      type="button"
                      className="flex h-36 w-36 flex-col items-center justify-center rounded-full border border-white/10 bg-background/78 px-5 text-center shadow-[0_18px_48px_rgba(0,0,0,0.32)] backdrop-blur-sm transition-all duration-150 hover:border-white/16"
                      onPointerDown={handleCenterPointerDown}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!isDragging) {
                          setIsOpen(true);
                        }
                      }}
                    >
                      <PreviewIcon size={22} style={{ color: previewItem.accentColor }} />
                      <div className="mt-3 text-[17px] font-medium tracking-tight text-foreground">
                        {t(`menu.${previewItem.id}`)}
                      </div>
                      <div className="mt-2 max-w-[8rem] text-[11px] leading-5 text-muted-foreground">
                        {t('topbar.dragHint')}
                      </div>
                    </button>
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
        onWheel={handleTriggerWheel}
        className={cn(
          'group flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-all duration-150',
          isOpen
            ? 'border-white/14 bg-secondary/60 text-foreground shadow-[0_10px_28px_rgba(0,0,0,0.18)]'
            : 'border-border/60 bg-secondary/25 text-muted-foreground hover:border-border hover:bg-secondary/40 hover:text-foreground',
        )}
      >
        <span className="flex h-5 w-5 items-center justify-center" style={{ color: activeItem.accentColor }}>
          <RadialGlyph activeColor={activeItem.accentColor} />
        </span>
        <span className="text-[12px] font-medium tracking-wide text-foreground/92">
          {t(`menu.${activeView}`)}
        </span>
        <ChevronDown size={13} className={cn('transition-transform duration-150', isOpen && 'rotate-180')} />
      </button>
      {overlay}
    </>
  );
}
