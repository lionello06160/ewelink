'use client';

import Link from 'next/link';
import { clsx } from 'clsx';
import { Minimize2, Settings, SlidersHorizontal, X } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { CameraOverlay } from '@/components/camera-overlay';
import { useConfigStore } from '@/store/config-store';
import { ConfigLoader } from '@/components/config-loader';

type ColumnMode = 'auto' | 1 | 2 | 3 | 4;
type StreamMode = 'auto' | 'low-latency' | 'stable';
type RefreshInterval = 0 | 5 | 10 | 30 | 60;

type FullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function getAutoColumnCount(width: number) {
  if (width >= 1536) return 4;
  if (width >= 1280) return 3;
  if (width >= 768) return 2;
  return 1;
}

function SettingChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-xl px-3 py-2 text-xs font-bold transition-all",
        active
          ? "bg-white text-slate-950 shadow-[0_10px_30px_rgba(255,255,255,0.12)]"
          : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
      )}
    >
      {children}
    </button>
  );
}

export default function HomePage() {
  const cameras = useConfigStore((s) => s.cameras);
  const settings = useConfigStore((s) => s.settings);
  const [localColumns, setLocalColumns] = useState<ColumnMode>(2);
  const [streamMode, setStreamMode] = useState<StreamMode>('auto');
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const [minimalMode, setMinimalMode] = useState(false);
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(0);
  const lastForegroundRefreshAtRef = useRef(0);
  const effectiveColumns = Math.max(
    1,
    Math.min(
      localColumns === 'auto' ? getAutoColumnCount(viewportWidth) : localColumns,
      cameras.length || 1
    )
  );

  const enterMinimalMode = async () => {
    setMinimalMode(true);

    const fullscreenDocument = document as FullscreenDocument;
    const root = document.documentElement as FullscreenElement;
    try {
      if (!fullscreenDocument.fullscreenElement && !fullscreenDocument.webkitFullscreenElement) {
        if (root.requestFullscreen) await root.requestFullscreen();
        else await root.webkitRequestFullscreen?.();
      }
    } catch {
      // Ignore fullscreen rejection and still keep minimal mode enabled.
    }
  };

  const exitMinimalMode = async () => {
    setMinimalMode(false);

    const fullscreenDocument = document as FullscreenDocument;
    try {
      if (fullscreenDocument.fullscreenElement) await fullscreenDocument.exitFullscreen();
      else await fullscreenDocument.webkitExitFullscreen?.();
    } catch {
      // Ignore fullscreen exit errors.
    }
  };

  // 初始化時讀取 LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem('ewelink_local_columns');
    if (saved) {
      setLocalColumns(saved === 'auto' ? 'auto' : (parseInt(saved, 10) as ColumnMode));
    } else {
      setLocalColumns((settings.columns as ColumnMode) || 2);
    }
  }, [settings.columns]);

  // 監聽來自 CameraOverlay 的即時更新事件
  useEffect(() => {
    const handleUpdate = () => {
      const saved = localStorage.getItem('ewelink_local_columns');
      if (saved) setLocalColumns(saved === 'auto' ? 'auto' : (parseInt(saved, 10) as ColumnMode));
    };
    window.addEventListener('ewelink-local-settings-changed', handleUpdate);
    return () => window.removeEventListener('ewelink-local-settings-changed', handleUpdate);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('ewelink_stream_mode');
    if (saved === 'auto' || saved === 'low-latency' || saved === 'stable') {
      setStreamMode(saved);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('ewelink_stream_refresh_interval');
    const parsed = saved ? parseInt(saved, 10) : 0;
    if (parsed === 5 || parsed === 10 || parsed === 30 || parsed === 60) {
      setRefreshInterval(parsed);
      return;
    }
    setRefreshInterval(0);
  }, []);

  useEffect(() => {
    localStorage.removeItem('ewelink_stream_route_mode');
    localStorage.removeItem('ewelink_camera_route_preferences_v1');
    localStorage.removeItem('ewelink_stream_route_cache_v1');
  }, []);

  useEffect(() => {
    const updateWidth = () => setViewportWidth(window.innerWidth);
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  useEffect(() => {
    if (!refreshInterval) return;
    const timerId = window.setInterval(() => {
      setRefreshTick((value) => value + 1);
    }, refreshInterval * 60 * 1000);

    return () => window.clearInterval(timerId);
  }, [refreshInterval]);

  useEffect(() => {
    if (!minimalMode && !settingsDrawerOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (settingsDrawerOpen) setSettingsDrawerOpen(false);
        else void exitMinimalMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [minimalMode, settingsDrawerOpen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreenDocument = document as FullscreenDocument;
      if (!fullscreenDocument.fullscreenElement && !fullscreenDocument.webkitFullscreenElement) {
        setMinimalMode(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener);
    };
  }, []);

  useEffect(() => {
    const triggerForegroundRefresh = () => {
      const now = Date.now();
      if (now - lastForegroundRefreshAtRef.current < 3000) return;
      lastForegroundRefreshAtRef.current = now;
      setRefreshTick((value) => value + 1);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerForegroundRefresh();
      }
    };

    const handleWindowFocus = () => {
      if (document.visibilityState === 'visible') {
        triggerForegroundRefresh();
      }
    };

    const handlePageShow = () => {
      triggerForegroundRefresh();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  return (
    <div className={clsx("min-h-dvh flex flex-col", minimalMode ? "bg-black" : "")}>
      <ConfigLoader />
      {minimalMode && (
        <button
          type="button"
          onClick={() => void exitMinimalMode()}
          className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-4 py-2 text-xs font-bold text-white backdrop-blur-xl transition hover:bg-black/75"
          aria-label="結束極簡模式"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
        >
          <Minimize2 size={14} />
          結束極簡
        </button>
      )}
      {/* Header */}
      {!minimalMode && (
      <header className="sticky top-0 z-30 border-b border-white/5 bg-slate-950/92 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
              e
            </div>
            <div>
              <h1 className="text-slate-100 font-semibold text-sm leading-none">
                監視控制中心
              </h1>
              <p className="text-slate-500 text-xs mt-0.5">
                即時影像 · IoT 設備控制
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => void enterMinimalMode()}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-bold text-slate-100 shadow-[0_16px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.1]"
            >
              <Minimize2 size={14} />
              進入極簡模式
            </button>

            <button
              type="button"
              onClick={() => setSettingsDrawerOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-bold text-slate-100 shadow-[0_16px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.1]"
            >
              <SlidersHorizontal size={14} />
              設定
            </button>

            <Link
              href="/admin"
              id="nav-admin"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg
                       text-xs text-slate-400 hover:text-slate-200
                       border border-white/10 hover:border-white/20
                       bg-white/5 hover:bg-white/10
                       transition-all"
            >
              <Settings size={13} />
              管理設定
            </Link>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            固定本地 LAN
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-slate-400">
            {streamMode === 'auto'
              ? '自動平衡延遲與穩定'
              : streamMode === 'low-latency'
                ? '低延遲優先'
                : '穩定優先'}
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-slate-400">
            {refreshInterval === 0 ? '不重整' : `每 ${refreshInterval} 分鐘靜默重連`}
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-slate-400">
            {localColumns === 'auto' ? '自動欄位' : `${localColumns} 欄`}
          </div>
        </div>
      </header>
      )}

      {!minimalMode && settingsDrawerOpen && (
        <>
          <button
            type="button"
            aria-label="關閉設定抽屜"
            className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setSettingsDrawerOpen(false)}
          />
          <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-white/10 bg-[#050816]/95 px-5 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300/80">Control Drawer</p>
                  <h2 className="mt-2 text-lg font-semibold text-white">播放設定</h2>
                  <p className="mt-1 text-sm text-slate-400">iPad、桌機都從這裡調整所有即時預覽設定。</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsDrawerOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-5 flex-1 space-y-6 overflow-y-auto pr-1">
                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">欄位排列</h3>
                    <p className="mt-1 text-xs text-slate-500">控制首頁同時顯示幾個監視器畫面。</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['auto', 1, 2, 3, 4] as const).map((num) => (
                      <SettingChip
                        key={num}
                        active={localColumns === num}
                        onClick={() => {
                          setLocalColumns(num);
                          localStorage.setItem('ewelink_local_columns', String(num));
                          window.dispatchEvent(new Event('ewelink-local-settings-changed'));
                        }}
                      >
                        {num === 'auto' ? '自動' : `${num} 欄`}
                      </SettingChip>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">定時重整</h3>
                    <p className="mt-1 text-xs text-slate-500">在頁內靜默重連播放器，不做整頁重新整理。</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {([0, 5, 10, 30, 60] as const).map((minutes) => (
                      <SettingChip
                        key={minutes}
                        active={refreshInterval === minutes}
                        onClick={() => {
                          setRefreshInterval(minutes);
                          localStorage.setItem('ewelink_stream_refresh_interval', String(minutes));
                        }}
                      >
                        {minutes === 0 ? '不重整' : `${minutes} 分`}
                      </SettingChip>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">播放策略</h3>
                    <p className="mt-1 text-xs text-slate-500">切換自動、低延遲或穩定優先。</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['auto', 'low-latency', 'stable'] as const).map((mode) => (
                      <SettingChip
                        key={mode}
                        active={streamMode === mode}
                        onClick={() => {
                          setStreamMode(mode);
                          localStorage.setItem('ewelink_stream_mode', mode);
                          window.dispatchEvent(new Event('ewelink-stream-mode-changed'));
                        }}
                      >
                        {mode === 'auto' ? '自動' : mode === 'low-latency' ? '低延遲' : '穩定'}
                      </SettingChip>
                    ))}
                  </div>
                </section>
              </div>

              <div className="mt-5 flex flex-wrap gap-3 border-t border-white/10 pt-4">
                <Link
                  href="/admin"
                  className="flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/15"
                >
                  <Settings size={14} />
                  前往管理設定
                </Link>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* Main */}
      <main className={clsx(
        "flex-1 w-full",
        minimalMode ? "p-0 bg-black" : "p-6"
      )}>
        {cameras.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-500">
            <p className="text-2xl">📷</p>
            <p className="text-sm">尚未設定任何攝影機</p>
            <Link
              href="/admin"
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500
                         text-white text-sm transition-colors"
            >
              前往管理設定
            </Link>
          </div>
        ) : (
          <div
            className={clsx(
              "grid",
              minimalMode
                ? cameras.length === 1
                  ? "min-h-dvh gap-0"
                  : "gap-px bg-white/10"
                : "gap-6",
              effectiveColumns === 1 ? "grid-cols-1" :
                effectiveColumns === 2 ? "grid-cols-1 md:grid-cols-2" :
                  effectiveColumns === 3 ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" :
                    effectiveColumns === 4 ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-4" :
                      "grid-cols-1 md:grid-cols-2"
            )}
          >
            {cameras.map((cam) => (
              <CameraOverlay
                key={cam.id}
                config={cam}
                minimalMode={minimalMode}
                fillViewport={minimalMode && cameras.length === 1}
                refreshToken={refreshTick}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
