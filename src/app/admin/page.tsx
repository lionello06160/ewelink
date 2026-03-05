'use client';

import { useState, useRef, useCallback, useTransition, useEffect } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import {
    ArrowLeft, Plus, Trash2, Edit3, GripVertical,
    Camera, Cpu, LayoutGrid, Save, X, RefreshCw,
    Loader2, CheckCircle2, AlertCircle, Wifi, WifiOff,
    Copy, Check, ChevronDown, ChevronRight, Zap,
    Scan, ChevronUp, Settings as LucideSettings,
} from 'lucide-react';
import { useConfigStore } from '@/store/config-store';
import { fetchDevicesAction } from '@/app/actions/iot';
import { getChannelCount, getChannelStates } from '@/lib/ihost-api';
import type { IHostDevice } from '@/lib/ihost-api';
import type { OverlayButton } from '@/types/camera';
import { ConfigLoader } from '@/components/config-loader';

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Input({
    label, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-xs text-slate-400 font-medium">{label}</span>
            <input
                {...props}
                className={clsx(
                    'px-3 py-2 rounded-lg bg-slate-800 border border-white/10',
                    'text-slate-100 text-sm placeholder:text-slate-600',
                    'focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50',
                    'transition-all',
                    props.className
                )}
            />
        </label>
    );
}

function Select({
    label, children, ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-xs text-slate-400 font-medium">{label}</span>
            <select
                {...props}
                className={clsx(
                    'px-3 py-2 rounded-lg bg-slate-800 border border-white/10',
                    'text-slate-100 text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-indigo-500/50',
                    'transition-all'
                )}
            >
                {children}
            </select>
        </label>
    );
}

function Btn({
    variant = 'default', className, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'default' | 'primary' | 'danger' | 'ghost' | 'success';
}) {
    return (
        <button
            {...props}
            className={clsx(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                variant === 'primary' && 'bg-indigo-600 hover:bg-indigo-500 text-white',
                variant === 'danger' && 'bg-red-600/80 hover:bg-red-500/90 text-white',
                variant === 'success' && 'bg-emerald-600/80 hover:bg-emerald-500/90 text-white',
                variant === 'ghost' && 'hover:bg-white/5 text-slate-400 hover:text-slate-200',
                variant === 'default' &&
                'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10',
                className
            )}
        />
    );
}

function Modal({
    title, onClose, children,
}: {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                    <h3 className="text-slate-100 font-semibold text-sm">{title}</h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
                        <X size={16} />
                    </button>
                </div>
                <div className="p-5 space-y-4">{children}</div>
            </div>
        </div>
    );
}

// ─── Tab 1: 鏡頭管理 ─────────────────────────────────────────────────────────

function CamerasTab() {
    const { cameras, addCamera, updateCamera, deleteCamera, moveCamera } = useConfigStore();
    const [modal, setModal] = useState<null | 'add' | { id: string; name: string; streamPath: string }>(null);
    const [name, setName] = useState('');
    const [streamPath, setStreamPath] = useState('');
    const [bgImage, setBgImage] = useState('');

    const openAdd = () => { setName(''); setStreamPath(''); setModal('add'); };
    const openEdit = (cam: typeof cameras[0]) => {
        setName(cam.name); setStreamPath(cam.streamPath); setBgImage(cam.backgroundImage ?? '');
        setModal({ id: cam.id, name: cam.name, streamPath: cam.streamPath });
    };
    const handleSave = () => {
        if (!name.trim() || !streamPath.trim()) return;
        if (modal === 'add') addCamera({ name: name.trim(), streamPath: streamPath.trim(), backgroundImage: bgImage.trim() });
        else if (modal && typeof modal === 'object')
            updateCamera(modal.id, { name: name.trim(), streamPath: streamPath.trim(), backgroundImage: bgImage.trim() });
        setModal(null);
    };

    return (
        <div className="space-y-6">

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <p className="text-slate-200 font-semibold text-sm">攝影機列表</p>
                        <span className="text-[10px] text-slate-500 bg-white/5 px-1.5 py-0.5 rounded">
                            {cameras.length}
                        </span>
                    </div>
                    <Btn variant="primary" onClick={openAdd} id="add-camera-btn" className="text-xs px-3 py-1.5">
                        <Plus size={14} /> 新增攝影機
                    </Btn>
                </div>

                {cameras.length === 0 && (
                    <div className="text-center py-12 text-slate-600 text-sm bg-slate-900/20 rounded-xl border border-dashed border-white/5">
                        尚未新增任何攝影機
                    </div>
                )}

                <div className="space-y-3">
                    {cameras.map((cam, idx) => (
                        <div key={cam.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-900/60 border border-white/[0.08] hover:border-white/15 transition-all group">
                            {/* 排序按鈕 */}
                            <div className="flex flex-col gap-1">
                                <button
                                    disabled={idx === 0}
                                    onClick={() => moveCamera(cam.id, 'up')}
                                    className="p-1 text-slate-600 hover:text-indigo-400 disabled:opacity-0 transition-all"
                                >
                                    <ChevronUp size={14} />
                                </button>
                                <button
                                    disabled={idx === cameras.length - 1}
                                    onClick={() => moveCamera(cam.id, 'down')}
                                    className="p-1 text-slate-600 hover:text-indigo-400 disabled:opacity-0 transition-all"
                                >
                                    <ChevronDown size={14} />
                                </button>
                            </div>

                            <div className="min-w-0 flex-1">
                                <p className="text-slate-200 font-medium text-sm">{cam.name}</p>
                                <p className="text-slate-500 text-[10px] mt-0.5 font-mono truncate">
                                    PATH: <span className="text-indigo-400/80">{cam.streamPath}</span>
                                    <span className="mx-2 text-slate-700">|</span>
                                    <span className="text-slate-500">{cam.buttons.length} 個按鈕</span>
                                </p>
                            </div>

                            <div className="flex items-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                                <Btn variant="ghost" onClick={() => openEdit(cam)} className="p-2 h-9 w-9"><Edit3 size={14} /></Btn>
                                <Btn variant="ghost" onClick={() => deleteCamera(cam.id)} className="p-2 h-9 w-9 hover:!text-red-400"><Trash2 size={14} /></Btn>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            {modal !== null && (
                <Modal title={modal === 'add' ? '新增攝影機' : '編輯攝影機'} onClose={() => setModal(null)}>
                    <Input label="攝影機名稱" placeholder="例：大門攝影機" value={name} onChange={(e) => setName(e.target.value)} id="camera-name-input" />
                    <Input label="mediamtx 串流路徑" placeholder="例：cam-b1p" value={streamPath} onChange={(e) => setStreamPath(e.target.value)} id="camera-stream-input" />
                    <Input label="編輯背景圖 URL (建議截圖攝影機畫面)" placeholder="http://... 或 data:image/..." value={bgImage} onChange={(e) => setBgImage(e.target.value)} id="camera-bg-input" />
                    <p className="text-[10px] text-slate-500 italic">
                        提示：您可以先到首頁截一張 16:9 的圖，然後將圖片網址或是 Base64 貼在這裡。
                    </p>
                    <p className="text-xs text-slate-600">
                        WHEP URL：<code className="text-indigo-400 ml-1">
                            {process.env.NEXT_PUBLIC_STREAM_BASE_URL ?? 'http://ihost-ip:8889'}/{streamPath || 'cam-b1p'}/whep
                        </code>
                    </p>
                    <div className="flex justify-end gap-2 pt-2">
                        <Btn onClick={() => setModal(null)}>取消</Btn>
                        <Btn variant="primary" onClick={handleSave} disabled={!name.trim() || !streamPath.trim()}>
                            <Save size={14} /> 儲存
                        </Btn>
                    </div>
                </Modal>
            )}
        </div>
    );
}

// ─── Tab 2: 按鈕編輯器 ────────────────────────────────────────────────────────

const VARIANTS = ['default', 'danger', 'success', 'warning'] as const;
const ACTIONS = ['toggle', 'on', 'off'] as const;

const EMOJI_CATEGORIES = [
    { label: '方向箭頭', icons: ['⬆️', '⬇️', '⬅️', '➡️', '↗️', '↘️', '↙️', '↖️', '↕️', '↔️', '🔄', '🔃'] },
    { label: '電力與開關', icons: ['⚡', '💡', '🔌', '🔘', '⚪', '⚫', '🔴', '🟢', '🔵', '🟡', '🟠', '🟣', '📴', '📳', '📶'] },
    { label: '出入口與居家', icons: ['🚪', '🏠', '🚗', '🚶', '🐕', '🐈', '🔔', '🚨', '🗝️', '🔑', '🛠️', '⚙️'] },
];

const variantLabel: Record<string, string> = {
    default: '🔘 預設（深色）', danger: '🔴 危險（紅色）',
    success: '🟢 確認（綠色）', warning: '🟡 注意（橙色）',
};
const variantDot: Record<string, string> = {
    default: 'bg-slate-500 border-slate-400', danger: 'bg-red-500 border-red-400',
    success: 'bg-emerald-500 border-emerald-400', warning: 'bg-amber-500 border-amber-400',
};

function outletLabel(outlet: number | undefined): string {
    if (outlet === undefined) return '';
    return ` (CH${outlet + 1})`;
}

// ─── Camera Frame Grabber ───────────────────────────────────────────────────

function FrameGrabber({ streamUrl, onCapture }: { streamUrl: string; onCapture: (dataUrl: string) => void }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const [status, setStatus] = useState<'idle' | 'loading' | 'live' | 'error'>('idle');

    const start = async () => {
        if (status === 'loading' || status === 'live') return;
        setStatus('loading');
        try {
            const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
            pcRef.current = pc;
            pc.addTransceiver('video', { direction: 'recvonly' });
            pc.ontrack = (e) => { if (videoRef.current && e.streams[0]) videoRef.current.srcObject = e.streams[0]; };
            pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') setStatus('live'); };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            const res = await fetch(streamUrl, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: offer.sdp });
            const answer = await res.text();
            await pc.setRemoteDescription({ type: 'answer', sdp: answer });
        } catch { setStatus('error'); }
    };

    const capture = () => {
        if (!videoRef.current) return;
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(videoRef.current, 0, 0);
        onCapture(canvas.toDataURL('image/jpeg', 0.8));
        stop();
    };

    const stop = () => {
        pcRef.current?.close();
        pcRef.current = null;
        setStatus('idle');
    };

    return (
        <div className="flex flex-col gap-2 p-3 bg-slate-950/50 rounded-xl border border-white/10">
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Scan size={12} className="text-indigo-400" /> 鏡頭畫面擷取器
                </span>
                {status === 'live' ? (
                    <div className="flex gap-2">
                        <Btn variant="primary" onClick={capture} className="py-1 px-2 text-[10px] h-7">📸 擷取當前畫面</Btn>
                        <Btn variant="ghost" onClick={stop} className="py-1 px-2 text-[10px] h-7">停止</Btn>
                    </div>
                ) : (
                    <Btn variant="default" onClick={start} disabled={status === 'loading'} className="py-1 px-2 text-[10px] h-7">
                        {status === 'loading' ? '啟動中...' : '啟動預覽以擷取'}
                    </Btn>
                )}
            </div>
            {(status === 'loading' || status === 'live') && (
                <video ref={videoRef} autoPlay muted playsInline className="w-full aspect-video rounded-lg bg-black object-contain mt-1" />
            )}
        </div>
    );
}

function ButtonEditor() {
    const { cameras, hosts, updateCamera, addButton, updateButton, deleteButton, moveButton } = useConfigStore();
    const [selectedCamId, setSelectedCamId] = useState(cameras[0]?.id ?? '');
    const [editingBtn, setEditingBtn] = useState<OverlayButton | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const draggingId = useRef<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const cam = cameras.find((c) => c.id === selectedCamId);

    const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, btnId: string) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        draggingId.current = btnId;
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!draggingId.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
        const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
        moveButton(selectedCamId, draggingId.current, Math.round(x), Math.round(y));
    }, [selectedCamId, moveButton]);

    const onPointerUp = useCallback(() => { draggingId.current = null; }, []);

    const defaultForm = (): Omit<OverlayButton, 'id'> => ({
        label: '新按鈕', icon: '⚡', deviceId: '', action: 'toggle',
        outlet: undefined, x: 50, y: 50, variant: 'default',
        scale: 1, hostId: undefined,
    });
    const [form, setForm] = useState<Omit<OverlayButton, 'id'>>(defaultForm());
    // 暫存通道數，讓 UI 顯示通道選擇器
    const [channelCount, setChannelCount] = useState(1);

    const openAdd = () => { setForm(defaultForm()); setChannelCount(1); setIsAdding(true); setEditingBtn(null); };
    const openEdit = (btn: OverlayButton) => {
        const ch = btn.outlet !== undefined ? btn.outlet + 1 : 1;
        setForm({
            label: btn.label, icon: btn.icon ?? '⚡', deviceId: btn.deviceId,
            action: btn.action, outlet: btn.outlet, x: btn.x, y: btn.y,
            variant: btn.variant ?? 'default', scale: btn.scale ?? 1,
            hostId: btn.hostId
        });
        setChannelCount(ch > 1 ? ch : 1);
        setEditingBtn(btn); setIsAdding(false);
    };
    const handleSave = () => {
        if (!form.label.trim() || !form.deviceId.trim()) return;
        if (isAdding) addButton(selectedCamId, form);
        else if (editingBtn) updateButton(selectedCamId, editingBtn.id, form);
        setEditingBtn(null); setIsAdding(false);
    };

    if (cameras.length === 0) return (
        <div className="text-center py-12 text-slate-600 text-sm">請先在「鏡頭管理」新增攝影機</div>
    );

    return (
        <div className="space-y-4">
            <Select label="選擇要編輯的攝影機" value={selectedCamId} onChange={(e) => setSelectedCamId(e.target.value)} id="select-camera">
                {cameras.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
                {/* 預覽區 */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500">👆 拖曳按鈕調整位置 · 點擊按鈕進行編輯</p>
                        {cam && (
                            <div className="text-[10px] text-slate-500 flex items-center gap-2">
                                <span>當前比例: 16:9</span>
                                <span className="w-1 h-1 rounded-full bg-slate-700" />
                                <span>按鈕已自動縮放</span>
                            </div>
                        )}
                    </div>
                    <div
                        ref={containerRef}
                        onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                        className="relative w-full bg-slate-900 rounded-xl border border-white/10 overflow-hidden select-none bg-cover bg-center shadow-inner [container-type:inline-size]"
                        style={{
                            aspectRatio: '16/9',
                            backgroundImage: cam?.backgroundImage ? `url(${cam.backgroundImage})` : undefined
                        }}
                    >
                        {!cam?.backgroundImage && (
                            <>
                                <div className="absolute inset-0 opacity-10" style={{
                                    backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)',
                                    backgroundSize: '10% 10%',
                                }} />
                                <p className="absolute inset-0 flex items-center justify-center text-slate-700 text-sm pointer-events-none">
                                    攝影機畫面預覽區 ({cam?.backgroundImage ? '已設定背景' : '未設定背景'})
                                </p>
                            </>
                        )}
                        {cam?.buttons.map((btn) => {
                            // 正在編輯這個按鈕時，使用表單的即時狀態做預覽
                            const isEditing = editingBtn?.id === btn.id;
                            const previewScale = isEditing ? (form.scale ?? 1) : (btn.scale ?? 1);
                            const previewIcon = isEditing ? (form.icon ?? '⚡') : (btn.icon ?? '⚡');
                            const previewLabel = isEditing ? form.label : btn.label;
                            const previewVariant = isEditing ? (form.variant ?? 'default') : (btn.variant ?? 'default');
                            return (
                                <div
                                    key={btn.id}
                                    onPointerDown={(e) => onPointerDown(e, btn.id)}
                                    onClick={(e) => { e.stopPropagation(); openEdit(btn); }}
                                    style={{
                                        position: 'absolute', left: `${btn.x}%`, top: `${btn.y}%`,
                                        transform: `translate(-50%,-50%) scale(${previewScale})`,
                                        transformOrigin: 'center center',
                                        cursor: 'grab', zIndex: 10, touchAction: 'none',
                                        padding: '0.15cqw',
                                        borderRadius: '1.2cqw',
                                        transition: 'none',
                                    }}
                                    className={clsx(
                                        'flex items-center shrink-0 border backdrop-blur-md font-bold shadow-md whitespace-nowrap opacity-90',
                                        isEditing && 'ring-2 ring-white/100 opacity-100 z-20 scale-105',
                                        previewVariant === 'danger' ? 'bg-red-500 border-red-400 text-white' :
                                            previewVariant === 'success' ? 'bg-emerald-500 border-emerald-400 text-white' :
                                                previewVariant === 'warning' ? 'bg-amber-400 border-amber-300 text-black' :
                                                    'bg-indigo-600 border-indigo-400 text-white'
                                    )}
                                >
                                    <div
                                        className="flex items-center gap-[0.8cqw] px-[1.2cqw] py-[0.8cqw] rounded-[1.1cqw]"
                                    >
                                        <GripVertical className="shrink-0 opacity-40" style={{ width: '0.8cqw', height: '1cqw' }} />
                                        <span style={{ fontSize: '1.6cqw' }}>{previewIcon}</span>
                                        <span className="truncate max-w-[10cqw]" style={{ fontSize: '1.4cqw' }}>{previewLabel}</span>
                                    </div>
                                </div>
                            );
                        })}
                        {/* 新增模式時，即時預覽新按鈕 */}
                        {isAdding && (
                            <div
                                style={{
                                    position: 'absolute', left: `${form.x}%`, top: `${form.y}%`,
                                    transform: `translate(-50%,-50%) scale(${form.scale ?? 1})`,
                                    transformOrigin: 'center center',
                                    zIndex: 10,
                                    padding: '0.15cqw',
                                    borderRadius: '1.2cqw',
                                    transition: 'none',
                                }}
                                className={clsx(
                                    'flex items-center shrink-0 border backdrop-blur-md font-bold shadow-md whitespace-nowrap',
                                    'ring-2 ring-white/60 opacity-80 pointer-events-none',
                                    form.variant === 'danger' ? 'bg-red-500 border-red-400 text-white' :
                                        form.variant === 'success' ? 'bg-emerald-500 border-emerald-400 text-white' :
                                            form.variant === 'warning' ? 'bg-amber-400 border-amber-300 text-black' :
                                                'bg-indigo-600 border-indigo-400 text-white'
                                )}
                            >
                                <div className="flex items-center gap-[0.8cqw] px-[1.2cqw] py-[0.8cqw] rounded-[1.1cqw]">
                                    <span style={{ fontSize: '1.6cqw' }}>{form.icon || '⚡'}</span>
                                    <span className="truncate max-w-[10cqw]" style={{ fontSize: '1.4cqw' }}>{form.label || '新按鈕'}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {cam && (
                        <FrameGrabber
                            streamUrl={`${process.env.NEXT_PUBLIC_STREAM_BASE_URL}/${cam.streamPath}/whep`}
                            onCapture={(dataUrl) => updateCamera(cam.id, { name: cam.name, streamPath: cam.streamPath, backgroundImage: dataUrl })}
                        />
                    )}
                </div>

                {/* 右側：按鈕清單 + 表單 */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500">按鈕清單</p>
                        <Btn variant="primary" onClick={openAdd} className="text-xs px-2.5 py-1.5" id="add-button-btn">
                            <Plus size={12} /> 新增按鈕
                        </Btn>
                    </div>
                    {cam?.buttons.length === 0 && <p className="text-xs text-slate-600 text-center py-4">尚未新增任何按鈕</p>}
                    {cam?.buttons.map((btn) => (
                        <div key={btn.id} onClick={() => openEdit(btn)}
                            className={clsx(
                                'flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer border transition-all',
                                editingBtn?.id === btn.id
                                    ? 'bg-indigo-500/10 border-indigo-500/30'
                                    : 'bg-slate-900/60 border-white/[0.08] hover:border-white/15'
                            )}
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <span className={clsx('w-2.5 h-2.5 rounded-full border shrink-0', variantDot[btn.variant ?? 'default'])} />
                                <span className="text-slate-200 text-xs font-medium truncate">
                                    {btn.icon} {btn.label}
                                    {btn.outlet !== undefined && (
                                        <span className="ml-1.5 text-slate-500 font-normal">CH{btn.outlet + 1}</span>
                                    )}
                                </span>
                            </div>
                            <div className="flex items-center gap-1 ml-2 shrink-0">
                                <span className="text-slate-600 text-xs">{btn.x}%,{btn.y}%</span>
                                <button onClick={(e) => { e.stopPropagation(); deleteButton(selectedCamId, btn.id); }}
                                    className="ml-1 text-slate-600 hover:text-red-400 transition-colors p-1">
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>
                    ))}

                    {/* 表單 */}
                    {(isAdding || editingBtn) && (
                        <div className="mt-2 space-y-3 pt-3 border-t border-white/10">
                            <p className="text-xs text-slate-400 font-medium">
                                {isAdding ? '➕ 新增按鈕' : '✏️ 編輯按鈕'}
                            </p>
                            <div className="space-y-4">
                                {/* 1. 圖示選擇 (下拉選單) */}
                                <div className="space-y-2 p-3 bg-slate-950/20 rounded-xl border border-white/5">
                                    <span className="text-xs text-slate-400 font-medium block">圖示選擇</span>
                                    <div className="flex gap-2">
                                        <div className="w-12 h-10 flex items-center justify-center rounded-lg bg-slate-800 border border-white/10 text-xl shadow-inner">
                                            {form.icon || '⚡'}
                                        </div>
                                        <select
                                            className="flex-1 h-10 px-3 rounded-lg bg-slate-800 border border-white/10 text-sm text-slate-200 focus:outline-none appearance-none cursor-pointer"
                                            value={form.icon ?? ''}
                                            onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                                        >
                                            <option value="">快速選單（箭頭/開關）...</option>
                                            {EMOJI_CATEGORIES.map((cat) => (
                                                <optgroup key={cat.label} label={cat.label}>
                                                    {cat.icons.map((emoji) => (
                                                        <option key={emoji} value={emoji}>{emoji} {cat.label}</option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                        {EMOJI_CATEGORIES.flatMap(c => c.icons.slice(0, 4)).map((emoji) => (
                                            <button key={emoji} type="button" onClick={() => setForm((f) => ({ ...f, icon: emoji }))}
                                                className={clsx("h-7 w-7 flex items-center justify-center rounded transition-all border", form.icon === emoji ? "bg-indigo-600 border-indigo-400 text-white" : "bg-slate-800 border-white/5 hover:bg-slate-700 text-slate-400")}>{emoji}</button>
                                        ))}
                                    </div>
                                </div>


                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <Input label="按鈕名稱" placeholder="例：大門" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} id="btn-label-input" />
                                        <Input label="序號 (SN)" placeholder="serial_number" value={form.deviceId} onChange={(e) => setForm((f) => ({ ...f, deviceId: e.target.value }))} id="btn-device-input" />
                                    </div>
                                    <Select
                                        label="所屬 iHost"
                                        value={form.hostId || ''}
                                        onChange={(e) => setForm((f) => ({ ...f, hostId: e.target.value || undefined }))}
                                    >
                                        <option value="">預設主機 (.env.local)</option>
                                        {hosts.map(h => <option key={h.id} value={h.id}>{h.name} ({h.ip})</option>)}
                                    </Select>
                                </div>

                                {/* 2. 按鈕縮放 */}
                                <div className="space-y-1.5 px-3 py-2 bg-slate-950/20 rounded-xl border border-white/5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-slate-400 font-medium">按鈕大小倍率</span>
                                        <span className="text-xs text-indigo-400 font-mono font-bold">{(form.scale ?? 1).toFixed(1)}x</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.5"
                                        max="2.5"
                                        step="0.1"
                                        value={form.scale ?? 1}
                                        onChange={(e) => setForm((f) => ({ ...f, scale: parseFloat(e.target.value) }))}
                                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
                                    />
                                    <div className="flex justify-between text-[10px] text-slate-600 font-mono">
                                        <span>0.5x</span>
                                        <span>1.0x</span>
                                        <span>1.5x</span>
                                        <span>2.0x</span>
                                        <span>2.5x</span>
                                    </div>
                                </div>

                                {/* 3. 通道與動作設定 */}
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 text-xs text-slate-400 font-medium cursor-pointer">
                                            <input type="checkbox" checked={form.outlet !== undefined} onChange={(e) => setForm((f) => ({ ...f, outlet: e.target.checked ? 0 : undefined }))} className="rounded border-white/10 bg-slate-900" />
                                            多通道切換 (CH)
                                        </label>
                                        {form.outlet !== undefined && (
                                            <div className="flex gap-2">
                                                <div className="flex-1">
                                                    <Select label="通道" value={String(form.outlet)} onChange={(e) => setForm((f) => ({ ...f, outlet: Number(e.target.value) }))} id="btn-outlet-select">
                                                        {Array.from({ length: channelCount }, (_, i) => (<option key={i} value={i}>通道 {i + 1}</option>))}
                                                    </Select>
                                                </div>
                                                <div className="flex gap-1 shrink-0">
                                                    {[2, 3, 4].map(n => (
                                                        <button key={n} type="button" onClick={() => setChannelCount(n)} className={clsx('w-9 py-2 rounded text-[10px] border transition-all', channelCount === n ? 'bg-indigo-600/30 border-indigo-400 text-indigo-300' : 'bg-slate-800 border-white/5 text-slate-500')}>{n}開</button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 pb-1">
                                        <Select label="觸發動作" value={form.action} onChange={(e) => setForm((f) => ({ ...f, action: e.target.value as any }))} id="btn-action-select">
                                            {ACTIONS.map((a) => <option key={a} value={a}>{a === 'toggle' ? '切換' : a === 'on' ? '開啟' : '關閉'}</option>)}
                                        </Select>
                                        <Select label="顏色樣式" value={form.variant ?? 'default'} onChange={(e) => setForm((f) => ({ ...f, variant: e.target.value as any }))} id="btn-variant-select">
                                            {VARIANTS.map((v) => <option key={v} value={v}>{variantLabel[v]}</option>)}
                                        </Select>
                                    </div>

                                    <div className="flex gap-2 pt-2">
                                        <Btn onClick={() => { setEditingBtn(null); setIsAdding(false); }} className="flex-1 justify-center py-2.5">取消</Btn>
                                        <Btn variant="primary" onClick={handleSave} disabled={!form.label.trim() || !form.deviceId.trim()} className="flex-1 justify-center py-2.5" id="save-button-btn">
                                            <Save size={13} /> 儲存
                                        </Btn>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Tab 3: iHost 設備 ────────────────────────────────────────────────────────

const CHANNEL_ICONS = ['💡', '🔌', '🚿', '🚗'];
const CHANNEL_COLOR: Array<'warning' | 'success' | 'default' | 'danger'> = ['warning', 'success', 'default', 'danger'];

function DevicesTab() {
    const { cameras, hosts, addButton } = useConfigStore();
    const [devices, setDevices] = useState<IHostDevice[]>([]);
    const [status, setStatus] = useState<'idle' | 'ok' | 'err'>('idle');
    const [errMsg, setErrMsg] = useState('');
    const [copied, setCopied] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set()); // deviceId[:outlet]
    const [isPending, startTransition] = useTransition();
    const [activeHostId, setActiveHostId] = useState<string>('');

    // Target camera for quick-add
    const [targetCamId, setTargetCamId] = useState(cameras[0]?.id ?? '');

    // 切換目標攝影機時，重置「已加入」紀錄，避免按鈕殘留「已加入」狀態
    useEffect(() => {
        setAddedKeys(new Set());
    }, [targetCamId]);

    const refresh = () => {
        startTransition(async () => {
            const hId = activeHostId === '' ? undefined : activeHostId;
            const result = await fetchDevicesAction(hId);
            if (result.success) {
                setDevices(result.devices);
                setStatus('ok');
                // 重新掃描後清除「已加入」紀錄，避免殘留舊狀態
                setAddedKeys(new Set());
                // 多通道設備預設展開
                const toExpand = new Set<string>();
                result.devices.forEach((d) => {
                    if (getChannelCount(d) > 1) toExpand.add(d.serial_number);
                });
                setExpanded(toExpand);
            } else {
                setErrMsg(result.error);
                setStatus('err');
            }
        });
    };

    const copyId = (id: string) => {
        navigator.clipboard.writeText(id);
        setCopied(id);
        setTimeout(() => setCopied(null), 2000);
    };

    const toggleExpand = (id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    /** 快速新增單一通道按鈕 */
    const quickAdd = (device: IHostDevice, outlet?: number) => {
        if (!targetCamId) return;
        const d = device;
        const chLabel = outlet !== undefined ? ` CH${outlet + 1}` : '';
        const key = outlet !== undefined ? `${d.serial_number}:${outlet}` : d.serial_number;
        addButton(targetCamId, {
            label: `${d.name}${chLabel}`,
            icon: outlet !== undefined ? CHANNEL_ICONS[outlet] ?? '⚡' : '⚡',
            deviceId: d.serial_number,
            action: 'toggle',
            outlet,
            // 分散排列，避免重疊
            x: 15 + (outlet ?? 0) * 25,
            y: 80,
            variant: outlet !== undefined ? CHANNEL_COLOR[outlet] : 'default',
            hostId: activeHostId === '' ? undefined : activeHostId,
        });
        setAddedKeys((prev) => new Set([...prev, key]));
    };

    /** 一鍵加入所有通道 */
    const quickAddAll = (device: IHostDevice) => {
        const count = getChannelCount(device);
        for (let i = 0; i < count; i++) quickAdd(device, i);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap bg-slate-900/40 p-3 rounded-xl border border-white/5">
                <div className="flex-1 min-w-[200px] flex items-center gap-3">
                    <span className="text-slate-400 text-xs font-semibold whitespace-nowrap">掃描來源：</span>
                    <select
                        value={activeHostId}
                        onChange={(e) => {
                            setActiveHostId(e.target.value);
                            setStatus('idle');
                            setDevices([]);
                        }}
                        className="flex-1 max-w-[200px] bg-slate-950/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-indigo-300 focus:outline-none focus:border-indigo-500/50"
                    >
                        <option value="">預設主機 (.env.local)</option>
                        {hosts.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </select>
                </div>

                <Btn variant="primary" onClick={refresh} disabled={isPending} id="refresh-devices-btn" className="ml-auto px-4">
                    {isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    開始掃描
                </Btn>
            </div>

            {/* 目標攝影機選擇 */}
            {cameras.length > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                    <Zap size={14} className="text-indigo-400 shrink-0" />
                    <p className="text-xs text-indigo-300">快速新增到：</p>
                    <select
                        value={targetCamId}
                        onChange={(e) => setTargetCamId(e.target.value)}
                        className="flex-1 bg-transparent text-indigo-200 text-xs focus:outline-none"
                        id="quick-add-camera-select"
                    >
                        {cameras.map((c) => <option key={c.id} value={c.id} className="bg-slate-900">{c.name}</option>)}
                    </select>
                </div>
            )}

            {status === 'idle' && (
                <div className="text-center py-12 text-slate-600 text-sm">
                    按下「掃描設備」從 iHost 獲取裝置清單
                </div>
            )}

            {status === 'err' && (
                <div className="flex items-start gap-3 text-red-400 text-sm bg-red-500/10 rounded-xl p-4 border border-red-500/20">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <div>
                        <p className="font-medium">無法連線到 iHost</p>
                        <p className="text-xs text-red-400/70 mt-0.5">{errMsg}</p>
                        <p className="text-xs text-slate-500 mt-2">
                            確認 <code className="text-slate-400">.env.local</code> 中的{' '}
                            <code className="text-slate-400">IHOST_IP</code> 和{' '}
                            <code className="text-slate-400">IHOST_ACCESS_TOKEN</code> 是否正確
                        </p>
                    </div>
                </div>
            )}

            {status === 'ok' && (
                <div className="space-y-3">
                    <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 size={12} />
                        找到 {devices.length} 台設備
                    </p>

                    {devices.map((device) => {
                        const d = device;
                        const chCount = getChannelCount(device);
                        const chStates = getChannelStates(device);
                        const isMulti = chCount > 1;
                        const isOpen = expanded.has(d.serial_number);
                        const singleKey = d.serial_number;

                        return (
                            <div key={d.serial_number} className="rounded-xl bg-slate-900/60 border border-white/[0.08] overflow-hidden">
                                {/* 設備標題列 */}
                                <div className="flex items-center gap-3 px-4 py-3">
                                    {/* 展開/摺疊（多通道） */}
                                    {isMulti && (
                                        <button onClick={() => toggleExpand(d.serial_number)} className="text-slate-500 hover:text-slate-300 transition-colors">
                                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        </button>
                                    )}

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-slate-200 text-sm font-medium truncate">{d.name}</p>
                                            {/* 通道數徽章 */}
                                            {isMulti && (
                                                <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold shrink-0">
                                                    {chCount} 鍵
                                                </span>
                                            )}
                                        </div>
                                        {/* deviceId 可複製 */}
                                        <button onClick={() => copyId(d.serial_number)}
                                            className="flex items-center gap-1.5 mt-0.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-mono"
                                            title="點擊複製 serial_number"
                                        >
                                            {copied === d.serial_number
                                                ? <><Check size={10} className="text-emerald-400" /><span className="text-emerald-400">已複製！</span></>
                                                : <><Copy size={10} />{d.serial_number}</>
                                            }
                                        </button>
                                    </div>

                                    {/* 線上狀態 */}
                                    <span title={d.online ? '線上' : '離線'}>
                                        {d.online
                                            ? <Wifi size={13} className="text-emerald-400" />
                                            : <WifiOff size={13} className="text-slate-500" />
                                        }
                                    </span>

                                    {/* 單通道：直接新增按鈕 */}
                                    {!isMulti && (
                                        <Btn
                                            variant={addedKeys.has(singleKey) ? 'success' : 'default'}
                                            onClick={() => quickAdd(device)}
                                            disabled={!targetCamId}
                                            className="text-xs px-2.5 py-1.5 shrink-0"
                                        >
                                            {addedKeys.has(singleKey) ? <><Check size={12} /> 已加入</> : <><Plus size={12} /> 加入按鈕</>}
                                        </Btn>
                                    )}

                                    {/* 多通道：加入全部 */}
                                    {isMulti && (
                                        <Btn
                                            variant="primary"
                                            onClick={() => quickAddAll(device)}
                                            disabled={!targetCamId}
                                            className="text-xs px-2.5 py-1.5 shrink-0"
                                            title={`一次加入全部 ${chCount} 個通道按鈕`}
                                        >
                                            <Plus size={12} /> 全部加入
                                        </Btn>
                                    )}
                                </div>

                                {/* 多通道展開：各 CH 詳情 */}
                                {isMulti && isOpen && (
                                    <div className="border-t border-white/[0.06] divide-y divide-white/[0.04]">
                                        {Array.from({ length: chCount }, (_, i) => {
                                            const chKey = `${d.serial_number}:${i}`;
                                            const swState = chStates[i];
                                            return (
                                                <div key={i} className="flex items-center gap-3 px-4 py-2.5 pl-8 bg-slate-950/30">
                                                    <span className="text-base">{CHANNEL_ICONS[i] ?? '⚡'}</span>
                                                    <span className="text-slate-300 text-xs flex-1 font-medium">
                                                        通道 {i + 1}（CH{i + 1}）
                                                        <span className="text-slate-500 font-mono ml-2 text-xs">name: {i + 1}</span>
                                                    </span>
                                                    {/* 當前開關狀態 */}
                                                    {swState && (
                                                        <span className={clsx(
                                                            'px-2 py-0.5 rounded-full text-xs font-semibold border',
                                                            swState === 'on'
                                                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                                                : 'bg-slate-700 text-slate-400 border-slate-600'
                                                        )}>
                                                            {swState === 'on' ? 'ON' : 'OFF'}
                                                        </span>
                                                    )}
                                                    {/* 單獨加入此通道 */}
                                                    <Btn
                                                        variant={addedKeys.has(chKey) ? 'success' : 'default'}
                                                        onClick={() => quickAdd(device, i)}
                                                        disabled={!targetCamId}
                                                        className="text-xs px-2 py-1 shrink-0"
                                                    >
                                                        {addedKeys.has(chKey)
                                                            ? <><Check size={11} /> 已加入</>
                                                            : <><Plus size={11} /> 加入</>
                                                        }
                                                    </Btn>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

const TABS = [
    { id: 'cameras', label: '鏡頭管理', icon: Camera },
    { id: 'buttons', label: '按鈕編輯器', icon: LayoutGrid },
    { id: 'devices', label: 'iHost 設備', icon: Cpu },
] as const;
type TabId = typeof TABS[number]['id'];

export default function AdminPage() {
    const [tab, setTab] = useState<TabId>('cameras');
    return (
        <div className="min-h-dvh flex flex-col">
            <ConfigLoader />
            <header className="border-b border-white/5 px-6 py-4 flex items-center gap-4">
                <Link href="/" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm transition-colors" id="nav-home">
                    <ArrowLeft size={15} /> 返回監控
                </Link>
                <div className="w-px h-5 bg-white/10" />
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center text-white font-bold text-xs">e</div>
                    <span className="text-slate-300 font-semibold text-sm">管理設定</span>
                </div>
                <p className="ml-auto text-xs text-slate-600">設定儲存於 data/config.json</p>
            </header>

            <div className="border-b border-white/5 px-6">
                <nav className="flex gap-1 -mb-px">
                    {TABS.map(({ id, label, icon: Icon }) => (
                        <button key={id} id={`tab-${id}`} onClick={() => setTab(id)}
                            className={clsx(
                                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all',
                                tab === id ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'
                            )}
                        >
                            <Icon size={14} />{label}
                        </button>
                    ))}
                </nav>
            </div>

            <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
                {tab === 'cameras' && <CamerasTab />}
                {tab === 'buttons' && <ButtonEditor />}
                {tab === 'devices' && <DevicesTab />}
            </main>
        </div>
    );
}
