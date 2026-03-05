'use client';

import {
    useEffect,
    useRef,
    useState,
    useCallback,
    useTransition,
} from 'react';
import { clsx } from 'clsx';
import { AlertCircle, Loader2, WifiOff } from 'lucide-react';
import type { CameraConfig, OverlayButton } from '@/types/camera';
import { triggerSwitchAction, fetchDeviceStateAction } from '@/app/actions/iot';

// ─── 核心動畫 ──────────────────────────────────────────────────────────────────

const KEYFRAMES = `
@keyframes live-breathe {
    0%, 100% { transform: scale(1); box-shadow: 0 0 18px 0px rgba(74, 222, 128, 0.4), inset 0 0 8px rgba(74, 222, 128, 0.3); }
    50% { transform: scale(1.15); box-shadow: 0 0 32px 10px rgba(74, 222, 128, 0.6), inset 0 0 12px rgba(255, 255, 255, 0.5); }
}
@keyframes border-beam-rotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
@keyframes live-breathe {
    0%, 100% { transform: scale(1); box-shadow: 0 0 16px rgba(74, 222, 128, 0.4); }
    50% { transform: scale(1.1); box-shadow: 0 0 28px rgba(74, 222, 128, 0.7); }
}
.live-breathe { animation: live-breathe 2.2s ease-in-out infinite; border-radius: 9999px; }
`;

// ─── WebRTC Player ───────────────────────────────────────────────────────────

interface WhepPlayerProps {
    whepUrl: string;
    onStatusChange: (status: 'connecting' | 'live' | 'error' | 'stale') => void;
}

function WhepPlayer({ whepUrl, onStatusChange }: WhepPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const lastTimeRef = useRef(0);
    const lastHashRef = useRef('');
    const staleCounterRef = useRef(0);

    useEffect(() => {
        let cancelled = false;
        onStatusChange('connecting');

        async function connect() {
            try {
                const pc = new RTCPeerConnection({
                    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
                });
                pcRef.current = pc;
                pc.addTransceiver('video', { direction: 'recvonly' });
                pc.addTransceiver('audio', { direction: 'recvonly' });

                pc.ontrack = (e) => {
                    if (videoRef.current && e.streams[0]) {
                        videoRef.current.srcObject = e.streams[0];
                    }
                };

                pc.onconnectionstatechange = () => {
                    if (cancelled) return;
                    if (pc.connectionState === 'connected') onStatusChange('live');
                    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')
                        onStatusChange('error');
                };

                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                const response = await fetch(whepUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/sdp' },
                    body: offer.sdp,
                });

                if (!response.ok) throw new Error(`WHEP error: ${response.status}`);
                const answerSdp = await response.text();
                await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
            } catch {
                if (!cancelled) onStatusChange('error');
            }
        }

        connect();

        const monitorId = setInterval(() => {
            const video = videoRef.current;
            if (!video || video.paused || video.ended || video.readyState < 2) return;

            const curTime = video.currentTime;
            const timeAdvanced = curTime !== lastTimeRef.current;
            lastTimeRef.current = curTime;

            let pixelChanged = true;
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 10; canvas.height = 10;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(video, 0, 0, 10, 10);
                    const currentHash = canvas.toDataURL();
                    pixelChanged = currentHash !== lastHashRef.current;
                    lastHashRef.current = currentHash;
                }
            } catch { /* ignore */ }

            if (!timeAdvanced && !pixelChanged) {
                staleCounterRef.current += 1;
                if (staleCounterRef.current >= 5) onStatusChange('stale');
            } else {
                staleCounterRef.current = 0;
                onStatusChange('live');
            }
        }, 2000);

        return () => {
            cancelled = true;
            clearInterval(monitorId);
            pcRef.current?.close();
            pcRef.current = null;
        };
    }, [whepUrl, onStatusChange]);

    return (
        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
    );
}

// ─── Overlay Button ───────────────────────────────────────────────────────────

const glowColors: Record<string, string> = {
    default: '#6366f1',
    danger: '#ef4444',
    success: '#10b981',
    warning: '#f59e0b',
};

const variantOnStyles = {
    default: 'bg-indigo-600 text-white',
    danger: 'bg-red-500 text-white',
    success: 'bg-emerald-500 text-white',
    warning: 'bg-amber-400 text-black',
};

const variantOffStyles = {
    default: 'text-white border-transparent',
    danger: 'text-white border-transparent',
    success: 'text-white border-transparent',
    warning: 'text-black border-transparent',
};

interface OverlayButtonProps {
    button: OverlayButton;
}

function OverlayBtn({ button }: OverlayButtonProps) {
    const [isPending, startTransition] = useTransition();
    const [feedback, setFeedback] = useState<'idle' | 'ok' | 'err'>('idle');
    const [isOn, setIsOn] = useState<boolean | null>(null);

    const syncState = useCallback(async () => {
        const result = await fetchDeviceStateAction(button.deviceId);
        if (result.success && result.state) {
            const s = result.state as Record<string, any>;
            let on: boolean;
            if (button.outlet !== undefined) {
                on = s?.toggle?.[String(button.outlet + 1)]?.toggleState === 'on';
            } else {
                on = s?.power?.powerState === 'on' || s?.toggle?.['1']?.toggleState === 'on';
            }
            setIsOn(on);
            return on;
        }
        return false;
    }, [button.deviceId, button.outlet]);

    useEffect(() => {
        let alive = true;
        syncState().then(on => { if (alive) setIsOn(on); });
        return () => { alive = false; };
    }, [syncState]);

    const handleClick = useCallback(() => {
        startTransition(async () => {
            const result = await triggerSwitchAction(button.deviceId, button.action, button.outlet);
            if (result.success) {
                setFeedback('ok');
                if (button.action === 'on') setIsOn(true);
                else if (button.action === 'off') setIsOn(false);
                else setIsOn(p => !p);
            } else {
                setFeedback('err');
            }
            setTimeout(() => setFeedback('idle'), 800);

            // 點擊後多次同步，應對點動開關
            await new Promise(r => setTimeout(r, 600));
            await syncState();
            await new Promise(r => setTimeout(r, 1200));
            await syncState();
        });
    }, [button.deviceId, button.action, button.outlet, syncState]);

    const variant = button.variant ?? 'default';
    const glowColor = glowColors[variant] ?? glowColors.default;

    return (
        <button
            onClick={handleClick}
            disabled={isPending}
            style={{
                position: 'absolute',
                left: `${button.x}%`,
                top: `${button.y}%`,
                transform: `translate(-50%, -50%) scale(${button.scale ?? 1})`,
                zIndex: 20,
                padding: '1.5px',
                borderRadius: '12px',
                overflow: 'hidden',
                transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                // 開啟時實心，關閉時透出底層
                backgroundColor: isOn ? '#1e293b' : 'transparent',
            }}
            className={clsx(
                'group flex items-center justify-center select-none active:scale-95 transition-transform shadow-xl',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                !isOn && 'bg-white/10 backdrop-blur-xl border border-white/5',
                isOn && 'shadow-[0_0_35px_-5px_rgba(0,0,0,0.6)]',
                feedback === 'err' && '!bg-red-600 !border-red-400',
            )}
        >
            {/* 核心流光層：使用大型旋轉漸層覆蓋底層 */}
            {isOn && (
                <div
                    className="absolute inset-[-500%] z-0 pointer-events-none"
                    style={{
                        animation: 'border-beam-rotate 3s linear infinite',
                        background: `conic-gradient(from 0deg, 
                            transparent 45%, 
                            ${glowColor} 48%, 
                            white 50%, 
                            ${glowColor} 52%, 
                            transparent 55%
                        )`,
                    }}
                />
            )}

            {/* 內容疊加層：負責遮擋中心並顯示樣式 */}
            <div
                className={clsx(
                    "relative z-10 w-full h-full flex items-center gap-2 px-3 py-2 rounded-[11px]",
                    "transition-colors duration-300",
                    isOn ? variantOnStyles[variant] : 'bg-transparent',
                )}
            >
                <div className="w-5 h-5 flex items-center justify-center shrink-0">
                    {isPending ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : feedback === 'err' ? (
                        <AlertCircle size={14} />
                    ) : (
                        <span className="text-base leading-none group-active:scale-120 transition-transform">
                            {button.icon ?? '⚡'}
                        </span>
                    )}
                </div>
                <span className="font-bold text-sm truncate flex-1 leading-none tracking-tight">
                    {button.label}
                </span>
            </div>
        </button>
    );
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'connecting' | 'live' | 'error' | 'stale' }) {
    if (status === 'live') {
        return (
            <div className="absolute top-4 left-4 z-20 flex items-center gap-2.5">
                <span
                    className="live-breathe inline-block"
                    style={{
                        width: 14, height: 14,
                        background: 'radial-gradient(circle at 35% 35%, #ffffff 0%, #4ade80 40%, #166534 80%, #064e3b 100%)',
                        boxShadow: '0 0 15px rgba(74, 222, 128, 0.5)',
                    }}
                />
                <span className="font-black text-red-500 text-xs tracking-[0.15em] drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]">
                    LIVE
                </span>
            </div>
        );
    }
    return (
        <div className={clsx(
            'absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-md border border-white/10',
            status === 'stale' && 'bg-amber-600/90 text-white animate-pulse',
            status === 'connecting' && 'bg-slate-800/80 text-indigo-300',
            status === 'error' && 'bg-red-600/80 text-white border-red-400',
        )}>
            {status === 'stale' && <><AlertCircle size={12} /> 畫面凍結</>}
            {status === 'connecting' && <><Loader2 size={12} className="animate-spin" /> 連線中</>}
            {status === 'error' && <><WifiOff size={12} /> 串流中斷</>}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface CameraOverlayProps {
    config: CameraConfig;
}

export function CameraOverlay({ config }: CameraOverlayProps) {
    const streamBaseUrl = process.env.NEXT_PUBLIC_STREAM_BASE_URL ?? '';
    const whepUrl = `${streamBaseUrl}/${config.streamPath}/whep`;
    const [streamStatus, setStreamStatus] = useState<'connecting' | 'live' | 'error' | 'stale'>('connecting');

    return (
        <div
            id={`camera-${config.id}`}
            className="relative w-full overflow-hidden rounded-2xl bg-[#0a0a0a] shadow-2xl group/camera"
            style={{ aspectRatio: '16/9' }}
        >
            <style>{KEYFRAMES}</style>
            <WhepPlayer whepUrl={whepUrl} onStatusChange={setStreamStatus} />

            {streamStatus !== 'live' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-xl z-10 gap-4">
                    {streamStatus === 'connecting' ? (
                        <Loader2 size={40} className="text-indigo-500 animate-spin opacity-50" />
                    ) : (
                        <WifiOff size={40} className="text-red-500 opacity-50" />
                    )}
                    <p className="text-slate-400 text-sm font-medium">
                        {streamStatus === 'connecting' ? '正在建立加密連線...' : '串流服務連線失敗'}
                    </p>
                </div>
            )}

            <StatusBadge status={streamStatus} />

            <div className="absolute top-4 right-4 z-20 px-3 py-1.5 rounded-full bg-black/40 border border-white/10 text-[11px] font-bold text-white/70 backdrop-blur-md">
                {config.name.toUpperCase()}
            </div>

            <div className="absolute inset-0 z-20 pointer-events-none">
                {config.buttons.map((btn) => (
                    <div key={btn.id} className="pointer-events-auto">
                        <OverlayBtn button={btn} />
                    </div>
                ))}
            </div>

            {/* 裝飾性漸層 */}
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent pointer-events-none z-10" />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent pointer-events-none z-10" />
        </div>
    );
}
