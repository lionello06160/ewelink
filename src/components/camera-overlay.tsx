'use client';

import {
    useEffect,
    useRef,
    useState,
    useCallback,
    useTransition,
} from 'react';
import { clsx } from 'clsx';
import { AlertCircle, Loader2, WifiOff, Settings, X } from 'lucide-react';
import type { CameraConfig, OverlayButton } from '@/types/camera';
import { triggerSwitchAction, fetchDeviceStateAction } from '@/app/actions/iot';
import { OverlayButtonView } from '@/components/overlay-button';

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

interface OverlayButtonProps {
    button: OverlayButton;
    globalScale: number;
}

function OverlayBtn({ button, globalScale }: OverlayButtonProps) {
    const [isPending, startTransition] = useTransition();
    const [feedback, setFeedback] = useState<'idle' | 'ok' | 'err'>('idle');
    const [isOn, setIsOn] = useState<boolean | null>(null);

    const syncState = useCallback(async () => {
        const result = await fetchDeviceStateAction(button.deviceId, button.hostId);
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
    }, [button.deviceId, button.outlet, button.hostId]);

    useEffect(() => {
        let alive = true;
        syncState().then(on => { if (alive) setIsOn(on); });
        return () => { alive = false; };
    }, [syncState]);

    const handleClick = useCallback(() => {
        startTransition(async () => {
            const result = await triggerSwitchAction(button.deviceId, button.action, button.outlet, button.hostId);
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
    }, [button.deviceId, button.action, button.outlet, button.hostId, syncState]);

    return (
        <OverlayButtonView
            button={button}
            globalScale={globalScale}
            isOn={isOn}
            isPending={isPending}
            feedback={feedback}
            onClick={handleClick}
        />
    );
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'connecting' | 'live' | 'error' | 'stale' }) {
    if (status === 'live') {
        return (
            <div
                className="absolute z-20 flex items-center"
                style={{ top: '1.5cqw', left: '1.5cqw', gap: '1cqw' }}
            >
                <span
                    className="live-breathe inline-block"
                    style={{
                        width: '1.2cqw', height: '1.2cqw',
                        background: 'radial-gradient(circle at 35% 35%, #ffffff 0%, #4ade80 40%, #166534 80%, #064e3b 100%)',
                        boxShadow: '0 0 1cqw rgba(74, 222, 128, 0.5)',
                    }}
                />
                <span
                    className="font-black text-red-500 tracking-[0.15em] drop-shadow-[0_0_0.5cqw_rgba(239,68,68,0.5)]"
                    style={{ fontSize: '1.2cqw' }}
                >
                    LIVE
                </span>
            </div>
        );
    }
    return (
        <div
            className={clsx(
                'absolute z-20 flex items-center font-bold backdrop-blur-md border border-white/10 text-white',
                status === 'stale' && 'bg-amber-600/90 animate-pulse',
                status === 'connecting' && 'bg-slate-800/80 text-indigo-300',
                status === 'error' && 'bg-red-600/80 border-red-400',
            )}
            style={{
                top: '1.5cqw', left: '1.5cqw', gap: '0.8cqw',
                paddingLeft: '1.2cqw', paddingRight: '1.2cqw',
                paddingTop: '0.6cqw', paddingBottom: '0.6cqw',
                borderRadius: '10cqw', fontSize: '1cqw'
            }}
        >
            {status === 'stale' && <><AlertCircle style={{ width: '1.2cqw' }} /> 畫面凍結</>}
            {status === 'connecting' && <><Loader2 style={{ width: '1.2cqw' }} className="animate-spin" /> 連線中</>}
            {status === 'error' && <><WifiOff style={{ width: '1.2cqw' }} /> 串流中斷</>}
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
    const [localGlobalScale, setLocalGlobalScale] = useState(1);
    const [showControls, setShowControls] = useState(false);

    // 從 LocalStorage 載入個人偏好
    useEffect(() => {
        const savedScale = localStorage.getItem('ewelink_global_btn_scale');
        if (savedScale) setLocalGlobalScale(parseFloat(savedScale));
    }, []);

    const handleScaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setLocalGlobalScale(val);
        localStorage.setItem('ewelink_global_btn_scale', val.toString());
    };

    return (
        <div
            id={`camera-${config.id}`}
            className="relative w-full overflow-hidden rounded-2xl bg-[#0a0a0a] shadow-2xl group/camera [container-type:inline-size]"
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

            <div
                className="absolute top-4 right-4 z-40 flex items-center gap-2"
            >
                {showControls && (
                    <div className="flex flex-col gap-3 p-4 bg-slate-900/95 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-200 min-w-[180px]">
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">按鈕縮放</span>
                            <button
                                onClick={() => setShowControls(false)}
                                className="p-1 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-white/40 font-mono italic">Scale Factor</span>
                                <span className="text-[10px] font-mono font-bold text-indigo-400">{Math.round(localGlobalScale * 100)}%</span>
                            </div>
                            <input
                                type="range" min="0.5" max="2.0" step="0.1"
                                value={localGlobalScale}
                                onChange={handleScaleChange}
                                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                            />
                        </div>
                    </div>
                )}

                <button
                    onClick={() => setShowControls(!showControls)}
                    className={clsx(
                        "flex items-center px-4 py-2 rounded-full backdrop-blur-md border transition-all duration-300",
                        showControls
                            ? "bg-indigo-600 border-indigo-400 text-white shadow-[0_0_20px_rgba(79,70,229,0.5)]"
                            : "bg-black/40 border-white/10 text-white/70 hover:bg-black/60"
                    )}
                >
                    <span className="text-[11px] font-black uppercase tracking-widest">{config.name}</span>
                </button>
            </div>

            <div className="absolute inset-0 z-20 pointer-events-none">
                {config.buttons.map((btn) => (
                    <div key={btn.id} className="pointer-events-auto">
                        <OverlayBtn button={btn} globalScale={localGlobalScale} />
                    </div>
                ))}
            </div>

            {/* 裝飾性漸層 */}
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent pointer-events-none z-10" />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent pointer-events-none z-10" />
        </div>
    );
}
