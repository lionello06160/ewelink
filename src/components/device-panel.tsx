'use client';

import { useState, useTransition } from 'react';
import { clsx } from 'clsx';
import {
    Settings,
    RefreshCw,
    Wifi,
    WifiOff,
    CheckCircle2,
    AlertCircle,
    Loader2,
} from 'lucide-react';
import { fetchDevicesAction } from '@/app/actions/iot';
import type { IHostDevice } from '@/lib/ihost-api';

export function DevicePanel() {
    const [devices, setDevices] = useState<IHostDevice[]>([]);
    const [status, setStatus] = useState<'idle' | 'ok' | 'err'>('idle');
    const [errMsg, setErrMsg] = useState('');
    const [isPending, startTransition] = useTransition();

    const refresh = () => {
        startTransition(async () => {
            const result = await fetchDevicesAction();
            if (result.success) {
                setDevices(result.devices);
                setStatus('ok');
            } else {
                setErrMsg(result.error);
                setStatus('err');
            }
        });
    };

    return (
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
                    <Settings size={15} />
                    iHost 設備清單
                </div>
                <button
                    id="refresh-devices-btn"
                    onClick={refresh}
                    disabled={isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                     bg-indigo-600/80 hover:bg-indigo-500/90 text-white
                     border border-indigo-400/50 transition-all
                     disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isPending ? (
                        <Loader2 size={13} className="animate-spin" />
                    ) : (
                        <RefreshCw size={13} />
                    )}
                    重新整理
                </button>
            </div>

            {/* Body */}
            <div className="p-4">
                {status === 'idle' && (
                    <p className="text-center text-slate-500 text-sm py-4">
                        按下「重新整理」取得設備列表
                    </p>
                )}

                {status === 'err' && (
                    <div className="flex items-start gap-2 text-red-400 text-sm bg-red-500/10 rounded-lg p-3 border border-red-500/20">
                        <AlertCircle size={15} className="mt-0.5 shrink-0" />
                        <div>
                            <p className="font-medium">無法連線到 iHost</p>
                            <p className="text-xs text-red-400/70 mt-0.5">{errMsg}</p>
                            <p className="text-xs text-slate-500 mt-1">
                                請確認 IHOST_IP 和 IHOST_ACCESS_TOKEN 是否正確設定
                            </p>
                        </div>
                    </div>
                )}

                {status === 'ok' && devices.length === 0 && (
                    <p className="text-center text-slate-500 text-sm py-4">
                        未找到任何設備
                    </p>
                )}

                {devices.length > 0 && (
                    <div className="space-y-2">
                        {devices.map((device) => {
                            const switchState = (device.state as { switch?: string })?.switch;
                            return (
                                <div
                                    key={device.serial_number}
                                    className="flex items-center justify-between
                             rounded-lg bg-slate-800/60 border border-white/5
                             px-3 py-2.5"
                                >
                                    <div className="min-w-0">
                                        <p className="text-slate-200 text-sm font-medium truncate">
                                            {device.name}
                                        </p>
                                        <p className="text-slate-500 text-xs font-mono mt-0.5">
                                            {device.serial_number}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 ml-3 shrink-0">
                                        {/* 開關狀態 */}
                                        {switchState && (
                                            <span
                                                className={clsx(
                                                    'px-2 py-0.5 rounded-full text-xs font-semibold',
                                                    switchState === 'on'
                                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                        : 'bg-slate-700 text-slate-400 border border-slate-600'
                                                )}
                                            >
                                                {switchState === 'on' ? 'ON' : 'OFF'}
                                            </span>
                                        )}
                                        {/* 線上狀態 */}
                                        <span title={device.online ? '線上' : '離線'}>
                                            {device.online ? (
                                                <Wifi size={14} className="text-emerald-400" />
                                            ) : (
                                                <WifiOff size={14} className="text-slate-500" />
                                            )}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                        <div className="flex items-center gap-1.5 text-emerald-400 text-xs pt-1">
                            <CheckCircle2 size={12} />
                            共 {devices.length} 台設備，複製 deviceId 填入按鈕設定
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
