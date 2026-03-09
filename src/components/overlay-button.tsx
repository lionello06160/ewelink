'use client';

import { clsx } from 'clsx';
import { AlertCircle, GripVertical, Loader2 } from 'lucide-react';
import type { OverlayButton } from '@/types/camera';

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

interface OverlayButtonViewProps {
    button: Pick<OverlayButton, 'label' | 'icon' | 'x' | 'y' | 'scale' | 'variant'>;
    globalScale?: number;
    isOn?: boolean | null;
    isPending?: boolean;
    disabled?: boolean;
    title?: string;
    feedback?: 'idle' | 'ok' | 'err';
    showGrip?: boolean;
    selected?: boolean;
    readOnly?: boolean;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    onPointerDown?: React.PointerEventHandler<HTMLButtonElement>;
}

export function OverlayButtonView({
    button,
    globalScale = 1,
    isOn = false,
    isPending = false,
    disabled = false,
    title,
    feedback = 'idle',
    showGrip = false,
    selected = false,
    readOnly = false,
    onClick,
    onPointerDown,
}: OverlayButtonViewProps) {
    const variant = button.variant ?? 'default';
    const glowColor = glowColors[variant] ?? glowColors.default;
    const finalScale = (button.scale ?? 1) * globalScale;

    return (
        <button
            type="button"
            onClick={onClick}
            onPointerDown={onPointerDown}
            disabled={isPending || disabled}
            title={title}
            style={{
                position: 'absolute',
                left: `${button.x}%`,
                top: `${button.y}%`,
                transform: `translate(-50%, -50%) scale(${finalScale})`,
                zIndex: selected ? 30 : 20,
                padding: '0.2cqw',
                borderRadius: '1.4cqw',
                overflow: 'hidden',
                transition: readOnly ? 'none' : 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                backgroundColor: isOn ? '#1e293b' : 'transparent',
                touchAction: showGrip ? 'none' : undefined,
                cursor: showGrip ? 'grab' : undefined,
            }}
            className={clsx(
                'group flex items-center justify-center select-none shadow-xl',
                !readOnly && 'active:scale-95 transition-transform',
                (isPending || disabled) && 'opacity-50 cursor-not-allowed',
                !isOn && 'bg-white/[0.03] backdrop-blur-md border border-white/5',
                isOn && 'shadow-[0_0_6cqw_-2cqw_rgba(0,0,0,0.6)]',
                feedback === 'err' && '!bg-red-600 !border-red-400',
                selected && 'ring-2 ring-white/90',
                readOnly && 'opacity-90',
            )}
        >
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

            <div
                className={clsx(
                    'relative z-10 w-full h-full flex items-center transition-colors duration-300 rounded-[1.2cqw]',
                    isOn ? variantOnStyles[variant] : 'bg-transparent',
                )}
                style={{
                    gap: '1.2cqw',
                    paddingLeft: '1.4cqw',
                    paddingRight: '1.4cqw',
                    paddingTop: '0.8cqw',
                    paddingBottom: '0.8cqw',
                }}
            >
                {showGrip && (
                    <GripVertical
                        className="shrink-0 opacity-40"
                        style={{ width: '1.4cqw', height: '1.8cqw' }}
                    />
                )}
                <div
                    className="flex items-center justify-center shrink-0"
                    style={{ width: '4.5cqw', height: '4.5cqw' }}
                >
                    {isPending ? (
                        <Loader2 className="animate-spin" style={{ width: '3cqw', height: '3cqw' }} />
                    ) : feedback === 'err' ? (
                        <AlertCircle style={{ width: '3cqw', height: '3cqw' }} />
                    ) : (
                        <span
                            className={clsx(!readOnly && 'group-active:scale-120 transition-transform', 'leading-none')}
                            style={{ fontSize: '3.8cqw' }}
                        >
                            {button.icon ?? '⚡'}
                        </span>
                    )}
                </div>
                <span
                    className="font-bold truncate flex-1 leading-none tracking-tight"
                    style={{ fontSize: '3.2cqw', maxWidth: '14cqw' }}
                >
                    {button.label}
                </span>
            </div>
        </button>
    );
}
