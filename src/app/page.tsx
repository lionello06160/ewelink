'use client';

import Link from 'next/link';
import { clsx } from 'clsx';
import { Settings } from 'lucide-react';
import { useState, useEffect } from 'react';
import { CameraOverlay } from '@/components/camera-overlay';
import { useConfigStore } from '@/store/config-store';
import { ConfigLoader } from '@/components/config-loader';

export default function HomePage() {
  const cameras = useConfigStore((s) => s.cameras);
  const settings = useConfigStore((s) => s.settings);
  const [localColumns, setLocalColumns] = useState<number>(2);

  // 初始化時讀取 LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem('ewelink_local_columns');
    if (saved) {
      setLocalColumns(parseInt(saved, 10));
    } else {
      setLocalColumns(settings.columns || 2);
    }
  }, [settings.columns]);

  // 監聽來自 CameraOverlay 的即時更新事件
  useEffect(() => {
    const handleUpdate = () => {
      const saved = localStorage.getItem('ewelink_local_columns');
      if (saved) setLocalColumns(parseInt(saved, 10));
    };
    window.addEventListener('ewelink-local-settings-changed', handleUpdate);
    return () => window.removeEventListener('ewelink-local-settings-changed', handleUpdate);
  }, []);

  return (
    <div className="min-h-dvh flex flex-col">
      <ConfigLoader />
      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4 flex items-center gap-3">
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
        <div className="ml-auto flex items-center gap-6">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 hidden sm:flex">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            本地 LAN 模式
          </div>

          <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-1">
            {[1, 2, 3, 4].map((num) => (
              <button
                key={num}
                onClick={() => {
                  setLocalColumns(num);
                  localStorage.setItem('ewelink_local_columns', num.toString());
                  window.dispatchEvent(new Event('ewelink-local-settings-changed'));
                }}
                className={clsx(
                  "px-3 py-1.5 rounded-md text-[11px] font-bold transition-all",
                  localColumns === num
                    ? "bg-indigo-600 text-white shadow-lg"
                    : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                )}
              >
                {num} 欄
              </button>
            ))}
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
      </header>

      {/* Main */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
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
              localColumns === 1 ? "grid-cols-1" :
                localColumns === 2 ? "grid-cols-1 md:grid-cols-2" :
                  localColumns === 3 ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" :
                    localColumns === 4 ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-4" :
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
