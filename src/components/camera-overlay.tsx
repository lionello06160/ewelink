'use client';

import {
    useEffect,
    useRef,
    useState,
    useCallback,
    useTransition,
} from 'react';
import { clsx } from 'clsx';
import Hls from 'hls.js';
import { AlertCircle, Loader2, WifiOff, Settings, X } from 'lucide-react';
import type { CameraConfig, OverlayButton } from '@/types/camera';
import { triggerSwitchAction, fetchDeviceStateAction } from '@/app/actions/iot';
import { OverlayButtonView } from '@/components/overlay-button';
import { useConfigStore } from '@/store/config-store';

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

interface HlsPlayerProps {
    hlsUrl: string;
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

function HlsPlayer({ hlsUrl, onStatusChange }: HlsPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        let hls: Hls | null = null;
        onStatusChange('connecting');

        const onCanPlay = () => onStatusChange('live');
        const onError = () => onStatusChange('error');

        video.addEventListener('canplay', onCanPlay);
        video.addEventListener('error', onError);

        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = hlsUrl;
            void video.play().catch(() => {});
        } else if (Hls.isSupported()) {
            hls = new Hls({
                lowLatencyMode: true,
                backBufferLength: 30,
            });
            hls.loadSource(hlsUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                void video.play().catch(() => {});
            });
            hls.on(Hls.Events.ERROR, (_, data) => {
                if (data.fatal) onStatusChange('error');
            });
        } else {
            onStatusChange('error');
        }

        return () => {
            video.pause();
            video.removeAttribute('src');
            video.load();
            video.removeEventListener('canplay', onCanPlay);
            video.removeEventListener('error', onError);
            hls?.destroy();
        };
    }, [hlsUrl, onStatusChange]);

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
    const [isDeviceOnline, setIsDeviceOnline] = useState<boolean | null>(null);

    const syncState = useCallback(async () => {
        const result = await fetchDeviceStateAction(button.deviceId, button.hostId);
        if (result.success) {
            setIsDeviceOnline(result.online);
        }
        if (result.success && result.online && result.state) {
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
        if (result.success && !result.online) {
            setIsOn(null);
        }
        if (!result.success && result.error.includes('offline')) {
            setIsDeviceOnline(false);
            setIsOn(null);
        }
        return false;
    }, [button.deviceId, button.outlet, button.hostId]);

    useEffect(() => {
        let alive = true;
        syncState().then(on => { if (alive) setIsOn(on); });
        return () => { alive = false; };
    }, [syncState]);

    const handleClick = useCallback(() => {
        if (isDeviceOnline === false) {
            setFeedback('err');
            setTimeout(() => setFeedback('idle'), 1200);
            return;
        }
        startTransition(async () => {
            const result = await triggerSwitchAction(button.deviceId, button.action, button.outlet, button.hostId);
            if (result.success) {
                setFeedback('ok');
                if (button.action === 'on') setIsOn(true);
                else if (button.action === 'off') setIsOn(false);
                else setIsOn(p => !p);
            } else {
                setFeedback('err');
                if (result.error.includes('offline')) {
                    setIsDeviceOnline(false);
                    setIsOn(null);
                }
            }
            setTimeout(() => setFeedback('idle'), 800);

            // 點擊後多次同步，應對點動開關
            await new Promise(r => setTimeout(r, 600));
            await syncState();
            await new Promise(r => setTimeout(r, 1200));
            await syncState();
        });
    }, [button.deviceId, button.action, button.outlet, button.hostId, isDeviceOnline, syncState]);

    return (
        <OverlayButtonView
            button={button}
            globalScale={globalScale}
            isOn={isOn}
            isPending={isPending}
            disabled={isDeviceOnline === false}
            title={isDeviceOnline === false ? '設備目前離線，iHost 不會執行此按鈕控制。' : undefined}
            feedback={feedback}
            onClick={handleClick}
        />
    );
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status, inline = false }: { status: 'connecting' | 'live' | 'error' | 'stale'; inline?: boolean }) {
    if (status === 'live') {
        return (
            <div
                className={clsx('flex items-center', !inline && 'absolute z-20')}
                style={inline ? { gap: 'clamp(0.3rem, 0.8vw, 0.45rem)' } : { top: '1.5cqw', left: '1.5cqw', gap: '1cqw' }}
            >
                <span
                    className="live-breathe inline-block"
                    style={inline ? {
                        width: 'clamp(0.5rem, 1vw, 0.7rem)',
                        height: 'clamp(0.5rem, 1vw, 0.7rem)',
                        background: 'radial-gradient(circle at 35% 35%, #ffffff 0%, #4ade80 40%, #166534 80%, #064e3b 100%)',
                        boxShadow: '0 0 0.55rem rgba(74, 222, 128, 0.45)',
                    } : {
                        width: '1.2cqw', height: '1.2cqw',
                        background: 'radial-gradient(circle at 35% 35%, #ffffff 0%, #4ade80 40%, #166534 80%, #064e3b 100%)',
                        boxShadow: '0 0 1cqw rgba(74, 222, 128, 0.5)',
                    }}
                />
                <span
                    className="font-black text-red-500 tracking-[0.15em] drop-shadow-[0_0_0.5cqw_rgba(239,68,68,0.5)]"
                    style={inline ? { fontSize: 'clamp(0.68rem, 1.2vw, 0.82rem)' } : { fontSize: '1.2cqw' }}
                >
                    LIVE
                </span>
            </div>
        );
    }
    return (
        <div
            className={clsx(
                'flex items-center font-bold backdrop-blur-md border border-white/10 text-white',
                !inline && 'absolute z-20',
                status === 'stale' && 'bg-amber-600/90 animate-pulse',
                status === 'connecting' && 'bg-slate-800/80 text-indigo-300',
                status === 'error' && 'bg-red-600/80 border-red-400',
            )}
            style={inline ? {
                gap: 'clamp(0.3rem, 0.8vw, 0.45rem)',
                paddingLeft: 'clamp(0.55rem, 1vw, 0.7rem)', paddingRight: 'clamp(0.55rem, 1vw, 0.7rem)',
                paddingTop: 'clamp(0.28rem, 0.7vw, 0.35rem)', paddingBottom: 'clamp(0.28rem, 0.7vw, 0.35rem)',
                borderRadius: '999px', fontSize: '0.72rem'
            } : {
                top: '1.5cqw', left: '1.5cqw', gap: '0.8cqw',
                paddingLeft: '1.2cqw', paddingRight: '1.2cqw',
                paddingTop: '0.6cqw', paddingBottom: '0.6cqw',
                borderRadius: '10cqw', fontSize: '1cqw'
            }}
        >
            {status === 'stale' && <><AlertCircle style={{ width: inline ? 'clamp(0.72rem, 1.2vw, 0.85rem)' : '1.2cqw' }} /> 畫面凍結</>}
            {status === 'connecting' && <><Loader2 style={{ width: inline ? 'clamp(0.72rem, 1.2vw, 0.85rem)' : '1.2cqw' }} className="animate-spin" /> 連線中</>}
            {status === 'error' && <><WifiOff style={{ width: inline ? 'clamp(0.72rem, 1.2vw, 0.85rem)' : '1.2cqw' }} /> 串流中斷</>}
        </div>
    );
}

function PathBadge({ inline = false }: { inline?: boolean }) {
    return (
        <div
            className={clsx(
                'border border-emerald-400/30 bg-emerald-500/15 font-bold text-white/90 backdrop-blur-md',
                inline ? 'flex items-center rounded-full' : 'absolute right-[1.5cqw] top-[1.5cqw] z-20 flex items-center rounded-[10cqw]'
            )}
            style={inline ? {
                gap: 'clamp(0.3rem, 0.8vw, 0.45rem)',
                paddingLeft: 'clamp(0.55rem, 1vw, 0.7rem)',
                paddingRight: 'clamp(0.55rem, 1vw, 0.7rem)',
                paddingTop: 'clamp(0.28rem, 0.7vw, 0.35rem)',
                paddingBottom: 'clamp(0.28rem, 0.7vw, 0.35rem)',
                fontSize: 'clamp(0.68rem, 1.2vw, 0.82rem)',
            } : {
                gap: '0.7cqw',
                paddingLeft: '1cqw',
                paddingRight: '1cqw',
                paddingTop: '0.5cqw',
                paddingBottom: '0.5cqw',
                fontSize: '0.9cqw',
            }}
        >
            <span
                className="inline-block rounded-full bg-emerald-400"
                style={inline ? { width: 'clamp(0.5rem, 1vw, 0.7rem)', height: 'clamp(0.5rem, 1vw, 0.7rem)' } : { width: '0.7cqw', height: '0.7cqw' }}
            />
            <span>LAN</span>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface CameraOverlayProps {
    config: CameraConfig;
    minimalMode?: boolean;
    fillViewport?: boolean;
    refreshToken?: number;
}

type StreamMode = 'auto' | 'low-latency' | 'stable';

function isPrivateIpv4(ip?: string) {
    if (!ip) return false;
    const match = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!match) return false;

    const [a, b, c, d] = match.slice(1).map(Number);
    if ([a, b, c, d].some((part) => part < 0 || part > 255)) return false;

    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
}

function shouldPreferHls(streamBaseUrl: string) {
    if (!streamBaseUrl) return false;

    try {
        const { hostname } = new URL(streamBaseUrl);
        if (isPrivateIpv4(hostname)) return false;
        if (hostname.endsWith('.ts.net')) return true;
        if (/^100\.\d+\.\d+\.\d+$/.test(hostname)) return true;
    } catch {
        return false;
    }

    return false;
}

function makeStreamBaseUrl(ip?: string) {
    return ip ? `http://${ip}:8889` : '';
}

export function CameraOverlay({ config, minimalMode = false, fillViewport = false, refreshToken = 0 }: CameraOverlayProps) {
    const hosts = useConfigStore((state) => state.hosts);
    const activeHost = config.streamHostId
        ? hosts.find((host) => host.id === config.streamHostId)
        : hosts[0];
    const streamIp = activeHost?.lanIp ?? activeHost?.ip;
    const streamBaseUrl = activeHost ? makeStreamBaseUrl(streamIp) : (process.env.NEXT_PUBLIC_STREAM_BASE_URL ?? '');
    const whepUrl = `${streamBaseUrl}/${config.streamPath}/whep`;
    const hlsUrl = (() => {
        if (!streamBaseUrl) return '';
        const url = new URL(streamBaseUrl);
        url.port = '8888';
        url.pathname = `/${config.streamPath}/index.m3u8`;
        return url.toString();
    })();
    const [streamMode, setStreamMode] = useState<StreamMode>('auto');
    const [streamStatus, setStreamStatus] = useState<'connecting' | 'live' | 'error' | 'stale'>('connecting');
    const [playbackMode, setPlaybackMode] = useState<'whep' | 'hls'>(
        shouldPreferHls(streamBaseUrl) ? 'hls' : 'whep'
    );
    const [localGlobalScale, setLocalGlobalScale] = useState(1);
    const [showControls, setShowControls] = useState(false);
    const [playerNonce, setPlayerNonce] = useState(0);
    const [isSilentRefreshing, setIsSilentRefreshing] = useState(false);

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

    useEffect(() => {
        const applyMode = () => {
            const saved = localStorage.getItem('ewelink_stream_mode');
            if (saved === 'low-latency' || saved === 'stable' || saved === 'auto') {
                setStreamMode(saved);
            } else {
                setStreamMode('auto');
            }
        };

        applyMode();
        window.addEventListener('ewelink-stream-mode-changed', applyMode);
        return () => window.removeEventListener('ewelink-stream-mode-changed', applyMode);
    }, []);

    const handleStreamStatus = useCallback((status: 'connecting' | 'live' | 'error' | 'stale') => {
        if (playbackMode === 'whep' && status === 'error' && hlsUrl) {
            setPlaybackMode('hls');
            setStreamStatus('connecting');
            return;
        }
        if (status === 'live' || status === 'error' || status === 'stale') {
            setIsSilentRefreshing(false);
        }
        setStreamStatus(status);
    }, [playbackMode, hlsUrl]);

    useEffect(() => {
        const preferredMode =
            streamMode === 'stable'
                ? 'hls'
                : streamMode === 'low-latency'
                    ? 'whep'
                    : shouldPreferHls(streamBaseUrl)
                        ? 'hls'
                        : 'whep';
        setPlaybackMode(preferredMode);
        setStreamStatus('connecting');
    }, [streamBaseUrl, whepUrl, hlsUrl, streamMode]);

    useEffect(() => {
        if (refreshToken === 0) return;
        setIsSilentRefreshing(true);
        setStreamStatus('connecting');
        setPlayerNonce((value) => value + 1);
    }, [refreshToken]);

    return (
        <div
            id={`camera-${config.id}`}
            className={clsx(
                'flex w-full flex-col',
                minimalMode
                    ? fillViewport
                        ? 'h-dvh gap-0 bg-black'
                        : 'gap-px bg-black'
                    : 'gap-3'
            )}
        >
            <style>{KEYFRAMES}</style>

            {!minimalMode && (
            <div className="flex items-center justify-between gap-3 px-1">
                <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                    <div className="min-w-0 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.18)] backdrop-blur-md">
                        <span className="block truncate text-[11px] font-black uppercase tracking-[0.18em] text-slate-100">
                            {config.name}
                        </span>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <StatusBadge status={streamStatus} inline />
                        <PathBadge inline />
                    </div>
                </div>

                <button
                    onClick={() => setShowControls(!showControls)}
                    aria-label={showControls ? '關閉按鈕縮放設定' : '開啟按鈕縮放設定'}
                    className={clsx(
                        'flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-md transition-all duration-300',
                        showControls
                            ? 'bg-indigo-600 border-indigo-400 text-white shadow-[0_0_20px_rgba(79,70,229,0.45)]'
                            : 'bg-white/[0.06] border-white/10 text-white/70 hover:bg-white/[0.1] hover:text-white'
                    )}
                >
                    <Settings size={16} />
                </button>
            </div>
            )}

            {!minimalMode && showControls && (
                <div className="flex items-start gap-4 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in duration-200">
                    <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">按鈕縮放</span>
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

                    <button
                        onClick={() => setShowControls(false)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            <div
                className={clsx(
                    'relative w-full overflow-hidden bg-[#0a0a0a] group/camera [container-type:inline-size]',
                    minimalMode
                        ? fillViewport
                            ? 'h-full rounded-none shadow-none'
                            : 'rounded-none shadow-none'
                        : 'rounded-2xl shadow-2xl'
                )}
                style={fillViewport ? undefined : { aspectRatio: '16/9' }}
            >
                {playbackMode === 'whep' ? (
                    <WhepPlayer key={`whep-${playerNonce}`} whepUrl={whepUrl} onStatusChange={handleStreamStatus} />
                ) : (
                    <HlsPlayer key={`hls-${playerNonce}`} hlsUrl={hlsUrl} onStatusChange={handleStreamStatus} />
                )}

                {streamStatus !== 'live' && !isSilentRefreshing && (
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

                <div className="absolute inset-0 z-20 pointer-events-none">
                    {config.buttons.map((btn) => (
                        <div key={btn.id} className="pointer-events-auto">
                            <OverlayBtn button={btn} globalScale={localGlobalScale} />
                        </div>
                    ))}
                </div>

                {/* 裝飾性漸層 */}
                {!minimalMode && (
                    <>
                        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent pointer-events-none z-10" />
                        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent pointer-events-none z-10" />
                    </>
                )}
            </div>
        </div>
    );
}
