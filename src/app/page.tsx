'use client';

import Link from 'next/link';
import { clsx } from 'clsx';
import { Settings } from 'lucide-react';
import { useState, useEffect } from 'react';
import { CameraOverlay } from '@/components/camera-overlay';
import { useConfigStore } from '@/store/config-store';
import { ConfigLoader } from '@/components/config-loader';

type ColumnMode = 'auto' | 1 | 2 | 3 | 4;
type StreamMode = 'auto' | 'low-latency' | 'stable';
type RouteMode = 'auto' | 'lan' | 'tailscale';

function getAutoColumnCount(width: number) {
  if (width >= 1536) return 4;
  if (width >= 1280) return 3;
  if (width >= 768) return 2;
  return 1;
}

export default function HomePage() {
  const cameras = useConfigStore((s) => s.cameras);
  const settings = useConfigStore((s) => s.settings);
  const [localColumns, setLocalColumns] = useState<ColumnMode>(2);
  const [streamMode, setStreamMode] = useState<StreamMode>('auto');
  const [routeMode, setRouteMode] = useState<RouteMode>('auto');
  const [viewportWidth, setViewportWidth] = useState<number>(0);
  const effectiveColumns = Math.max(
    1,
    Math.min(
      localColumns === 'auto' ? getAutoColumnCount(viewportWidth) : localColumns,
      cameras.length || 1
    )
  );

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
    const saved = localStorage.getItem('ewelink_stream_route_mode');
    if (saved === 'auto' || saved === 'lan' || saved === 'tailscale') {
      setRouteMode(saved);
    }
  }, []);

  useEffect(() => {
    const updateWidth = () => setViewportWidth(window.innerWidth);
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  return (
    <div className="min-h-dvh flex flex-col">
      <ConfigLoader />
      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4">
        <div className="flex items-center gap-3">
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
        <div className="ml-auto flex items-center gap-3">

          <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-1">
            {(['auto', 1, 2, 3, 4] as const).map((num) => (
              <button
                key={num}
                onClick={() => {
                  setLocalColumns(num);
                  localStorage.setItem('ewelink_local_columns', String(num));
                  window.dispatchEvent(new Event('ewelink-local-settings-changed'));
                }}
                className={clsx(
                  "px-3 py-1.5 rounded-md text-[11px] font-bold transition-all",
                  localColumns === num
                    ? "bg-indigo-600 text-white shadow-lg"
                    : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                )}
              >
                {num === 'auto' ? '自動' : `${num} 欄`}
              </button>
            ))}
          </div>

          <div className="hidden xl:flex items-center gap-3">
            <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-1">
              {(['auto', 'lan', 'tailscale'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setRouteMode(mode);
                    localStorage.setItem('ewelink_stream_route_mode', mode);
                    window.dispatchEvent(new Event('ewelink-stream-route-mode-changed'));
                  }}
                  className={clsx(
                    "px-3 py-1.5 rounded-md text-[11px] font-bold transition-all",
                    routeMode === mode
                      ? "bg-cyan-600 text-white shadow-lg"
                      : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                  )}
                >
                  {mode === 'auto' ? '自動路徑' : mode === 'lan' ? '本地 LAN' : 'VPN'}
                </button>
              ))}
            </div>

            <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-1">
              {(['auto', 'low-latency', 'stable'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setStreamMode(mode);
                    localStorage.setItem('ewelink_stream_mode', mode);
                    window.dispatchEvent(new Event('ewelink-stream-mode-changed'));
                  }}
                  className={clsx(
                    "px-3 py-1.5 rounded-md text-[11px] font-bold transition-all",
                    streamMode === mode
                      ? "bg-emerald-600 text-white shadow-lg"
                      : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                  )}
                >
                  {mode === 'auto' ? '自動' : mode === 'low-latency' ? '低延遲' : '穩定'}
                </button>
              ))}
            </div>
          </div>

          <Link
            href="/admin"
            id="nav-admin"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
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

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              路徑: {routeMode === 'auto' ? '自動切換 LAN / Tailscale' : routeMode === 'lan' ? '固定 LAN' : '固定 Tailscale'}
            </span>
          </div>
          <div>
            串流: {streamMode === 'auto'
              ? '自動平衡延遲與穩定'
              : streamMode === 'low-latency'
                ? '低延遲優先'
                : '穩定優先'}
          </div>
          <div>
            欄位: {localColumns === 'auto' ? '自動排列' : `${localColumns} 欄`}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 p-6 w-full">
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
              "grid gap-6",
              effectiveColumns === 1 ? "grid-cols-1" :
                effectiveColumns === 2 ? "grid-cols-1 md:grid-cols-2" :
                  effectiveColumns === 3 ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" :
                    effectiveColumns === 4 ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-4" :
                      "grid-cols-1 md:grid-cols-2"
            )}
          >
            {cameras.map((cam) => (
              <CameraOverlay key={cam.id} config={cam} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
