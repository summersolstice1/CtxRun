import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCrossWindowAppStoreSync } from '@/lib/hooks/useCrossWindowAppStoreSync';
import { applyThemeToDocument } from '@/lib/theme';
import { useAppStore } from '@/store/useAppStore';

const HOLD_DURATION_MS = 1500;
const RING_SIZE = 184;
const RING_STROKE_WIDTH = 6;
const RING_RADIUS = (RING_SIZE - RING_STROKE_WIDTH) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export default function GuardApp() {
  const theme = useAppStore((state) => state.theme);
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const holdStartedAtRef = useRef<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);

  useCrossWindowAppStoreSync();

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const stopHold = () => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    holdStartedAtRef.current = null;
    setIsHolding(false);
    setProgress(0);
  };

  const releaseGuard = async () => {
    if (isReleasing) {
      return;
    }

    setIsReleasing(true);
    try {
      await invoke('guard_request_release');
    } catch (error) {
      console.error('[Guard] Failed to release guard mode:', error);
      stopHold();
    } finally {
      setIsReleasing(false);
    }
  };

  const startHold = () => {
    if (isReleasing || rafRef.current !== null) {
      return;
    }

    setIsHolding(true);
    holdStartedAtRef.current = performance.now();

    const updateProgress = (timestamp: number) => {
      const startedAt = holdStartedAtRef.current;
      if (startedAt === null) {
        rafRef.current = null;
        return;
      }

      const nextProgress = Math.min((timestamp - startedAt) / HOLD_DURATION_MS, 1);
      setProgress(nextProgress);

      if (nextProgress >= 1) {
        rafRef.current = null;
        holdStartedAtRef.current = null;
        void releaseGuard();
        return;
      }

      rafRef.current = window.requestAnimationFrame(updateProgress);
    };

    rafRef.current = window.requestAnimationFrame(updateProgress);
  };

  const handleHoldStart = () => {
    startHold();
  };

  const handleHoldEnd = () => {
    if (!isReleasing) {
      stopHold();
    }
  };

  const progressPercent = Math.round(progress * 100);
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);

  return (
    <div
      className="relative flex h-screen w-screen items-center justify-center overflow-hidden"
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={t('guard.holdAction')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPercent}
        disabled={isReleasing}
        onPointerDown={handleHoldStart}
        onPointerUp={handleHoldEnd}
        onPointerLeave={handleHoldEnd}
        onPointerCancel={handleHoldEnd}
        onKeyDown={(event) => {
          if (event.repeat) {
            return;
          }

          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleHoldStart();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleHoldEnd();
          }
        }}
        className="group relative flex h-[184px] w-[184px] items-center justify-center rounded-full transition-transform duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-wait"
        style={{
          transform: `scale(${isHolding ? 0.972 : 1})`,
        }}
      >
        <svg
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          className="absolute inset-0 -rotate-90 overflow-visible"
        >
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE_WIDTH}
            stroke="rgba(255,255,255,0.16)"
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE_WIDTH}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            stroke="rgba(255,255,255,0.92)"
            className="transition-[stroke-dashoffset] duration-75 ease-out"
          />
        </svg>

        <div
          className="relative flex h-[144px] w-[144px] items-center justify-center rounded-full border shadow-[0_18px_36px_rgba(0,0,0,0.16)] transition-transform duration-200"
          style={{
            transform: `scale(${1 + progress * 0.012})`,
            borderColor: 'rgba(255,255,255,0.18)',
            background: 'rgba(10, 10, 10, 0.18)',
          }}
        >
          <div className="absolute inset-[8px] rounded-full border border-white/8" />

          <div className="relative flex flex-col items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] transition-transform duration-200"
              style={{ transform: `scale(${isHolding ? 0.94 : 1})` }}
            >
              <Lock className="h-5 w-5 text-white/90" strokeWidth={1.9} />
            </div>
            <div className="text-center text-[11px] font-medium tracking-[0.24em] text-white/90">
              {t('guard.holdAction')}
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}
