'use server';

import { setSwitch, getDevices, getDeviceState } from '@/lib/ihost-api';
function getHostEnvConfig(hostId?: string): { ip: string, token: string } | undefined {
    if (!hostId || hostId === 'default' || hostId === '') {
        if (process.env.IHOST_IP && process.env.IHOST_ACCESS_TOKEN) {
            return { ip: process.env.IHOST_IP, token: process.env.IHOST_ACCESS_TOKEN };
        }
        return undefined;
    }

    // 從 hostId 提取數字 (例如 "host2" -> "2")
    const match = hostId.match(/^host(\d+)$/);
    if (match) {
        const num = match[1];
        const ip = process.env[`IHOST${num}_IP`];
        const token = process.env[`IHOST${num}_ACCESS_TOKEN`];
        if (ip && token) {
            return { ip, token };
        }
    }
    return undefined;
}

export type ActionResult =
    | { success: true; message: string }
    | { success: false; error: string };

/** 觸發開關設備（支援單/多通道） */
export async function triggerSwitchAction(
    deviceId: string,
    action: 'on' | 'off' | 'toggle',
    outlet?: number,   // 多通道設備的通道索引
    hostId?: string
): Promise<ActionResult> {
    try {
        console.log(`[Action] Triggering switch: ${deviceId}, host: ${hostId}, action: ${action}, outlet: ${outlet}`);
        const host = getHostEnvConfig(hostId);
        await setSwitch(deviceId, action, outlet, host);
        const ch = outlet !== undefined ? ` 通道 ${outlet + 1}` : '';
        return {
            success: true,
            message: `設備 ${deviceId}${ch} 已${action === 'on' ? '開啟' : action === 'off' ? '關閉' : '切換'}`,
        };
    } catch (err) {
        console.error(`[Action Error] Failed to trigger switch:`, err);
        return {
            success: false,
            error: err instanceof Error ? err.message : '未知錯誤',
        };
    }
}

/** 取得所有設備清單 */
export async function fetchDevicesAction(hostId?: string) {
    try {
        const host = getHostEnvConfig(hostId);
        const devices = await getDevices(host);
        return { success: true as const, devices };
    } catch (err) {
        return {
            success: false as const,
            error: err instanceof Error ? err.message : '未知錯誤',
            devices: [],
        };
    }
}

/** 取得單一設備狀態 */
export async function fetchDeviceStateAction(deviceId: string, hostId?: string) {
    try {
        const host = getHostEnvConfig(hostId);
        const state = await getDeviceState(deviceId, host);
        return { success: true as const, state };
    } catch (err) {
        return {
            success: false as const,
            error: err instanceof Error ? err.message : '未知錯誤',
            state: null,
        };
    }
}
