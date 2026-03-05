'use server';

import { setSwitch, getDevices, getDeviceState } from '@/lib/ihost-api';

export type ActionResult =
    | { success: true; message: string }
    | { success: false; error: string };

/** 觸發開關設備（支援單/多通道） */
export async function triggerSwitchAction(
    deviceId: string,
    action: 'on' | 'off' | 'toggle',
    outlet?: number   // 多通道設備的通道索引
): Promise<ActionResult> {
    try {
        console.log(`[Action] Triggering switch: ${deviceId}, action: ${action}, outlet: ${outlet}`);
        await setSwitch(deviceId, action, outlet);
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
export async function fetchDevicesAction() {
    try {
        const devices = await getDevices();
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
export async function fetchDeviceStateAction(deviceId: string) {
    try {
        const state = await getDeviceState(deviceId);
        return { success: true as const, state };
    } catch (err) {
        return {
            success: false as const,
            error: err instanceof Error ? err.message : '未知錯誤',
            state: null,
        };
    }
}
