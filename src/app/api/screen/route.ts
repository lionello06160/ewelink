import { exec } from 'child_process';
import { promisify } from 'util';
import { NextRequest, NextResponse } from 'next/server';

const execAsync = promisify(exec);

// 簡單的 API Key 驗證（防止任何人隨便呼叫）
const API_KEY = process.env.SCREEN_API_KEY ?? 'change-me';

/** 控制螢幕電源
 *  支援 Raspberry Pi (vcgencmd) 和一般 Linux (xset dpms)
 */
async function setScreenPower(on: boolean) {
    const commands = [
        // RPi 5 / RPi 4 (wayland / X11)
        `vcgencmd display_power ${on ? '1' : '0'}`,
        // 備用：X11 DPMS
        `DISPLAY=:0 xset dpms force ${on ? 'on' : 'off'}`,
    ];

    for (const cmd of commands) {
        try {
            await execAsync(cmd);
            return { method: cmd, success: true };
        } catch {
            // 嘗試下一個指令
        }
    }
    throw new Error('無法控制螢幕：請確認是 Raspberry Pi 且在 X11/Wayland 環境下執行');
}

// 自動熄屏 timer
let sleepTimer: NodeJS.Timeout | null = null;

function resetSleepTimer(ms: number) {
    if (sleepTimer) clearTimeout(sleepTimer);
    sleepTimer = setTimeout(async () => {
        try {
            await setScreenPower(false);
        } catch {
            /* ignore */
        }
    }, ms);
}

// POST /api/screen
// Body: { "action": "on" | "off" | "wake", "autoSleepMs": 60000 }
// Header: x-api-key: <SCREEN_API_KEY>
export async function POST(req: NextRequest) {
    // 驗證 API Key
    const key = req.headers.get('x-api-key') ?? req.nextUrl.searchParams.get('key');
    if (key !== API_KEY) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action: 'on' | 'off' | 'wake' = body.action ?? 'on';
    // 預設：亮屏後 60 秒無動作自動熄屏（0 = 不自動熄屏）
    const autoSleepMs: number = body.autoSleepMs ?? 60_000;

    try {
        if (action === 'off') {
            if (sleepTimer) clearTimeout(sleepTimer);
            await setScreenPower(false);
            return NextResponse.json({ success: true, screen: 'off' });
        }

        // on / wake
        await setScreenPower(true);
        if (autoSleepMs > 0) resetSleepTimer(autoSleepMs);

        return NextResponse.json({
            success: true,
            screen: 'on',
            autoSleepMs: autoSleepMs > 0 ? autoSleepMs : null,
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// GET /api/screen — 用來測試連線
export async function GET(req: NextRequest) {
    const key = req.headers.get('x-api-key') ?? req.nextUrl.searchParams.get('key');
    if (key !== API_KEY) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ status: 'ok', message: '螢幕控制 API 正常' });
}
