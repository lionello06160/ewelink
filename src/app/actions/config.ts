'use server';

import { readConfig, writeConfig } from '@/lib/config-file';
import type { CameraConfig, OverlayButton } from '@/types/camera';

function uid() {
    return Math.random().toString(36).slice(2, 9);
}

// ── 讀取全部設定 ──────────────────────────────────
export async function getConfigAction() {
    const config = readConfig();

    // Auto-detect hosts from env. Do not expose tokens to frontend
    const hosts: Array<{ id: string, name: string, ip: string, lanIp?: string, tailscaleIp?: string }> = [];
    const pushHost = (id: string, name: string, prefix = 'IHOST') => {
        const apiIp = process.env[`${prefix}_IP`];
        const lanIp = process.env[`${prefix}_LAN_IP`];
        const tailscaleIp = process.env[`${prefix}_TAILSCALE_IP`] ?? apiIp;

        if (!apiIp && !lanIp && !tailscaleIp) return;

        hosts.push({
            id,
            name,
            ip: apiIp ?? tailscaleIp ?? lanIp ?? '',
            lanIp,
            tailscaleIp,
        });
    };

    pushHost('default', '預設主機 (.env)');

    // 支援 IHOST2_IP, IHOST3_IP ...
    for (let i = 2; i <= 5; i++) {
        pushHost(`host${i}`, `主機 ${i} (.env)`, `IHOST${i}`);
    }

    return {
        cameras: config.cameras,
        settings: config.settings ?? { columns: 2 },
        hosts
    };
}

// ── 攝影機 CRUD ───────────────────────────────────

export async function addCameraAction(data: {
    name: string;
    streamPath: string;
    streamHostId?: string;
    backgroundImage?: string;
}) {
    const config = readConfig();
    const newCam: CameraConfig = { id: uid(), ...data, buttons: [] };
    config.cameras.push(newCam);
    writeConfig(config);
    return newCam;
}

export async function updateCameraAction(
    id: string,
    data: {
        name: string;
        streamPath: string;
        streamHostId?: string;
        backgroundImage?: string;
    }
) {
    const config = readConfig();
    config.cameras = config.cameras.map((c) => (c.id === id ? { ...c, ...data } : c));
    writeConfig(config);
}

export async function deleteCameraAction(id: string) {
    const config = readConfig();
    config.cameras = config.cameras.filter((c) => c.id !== id);
    writeConfig(config);
}

// ── 按鈕 CRUD ──────────────────────────────────────

export async function addButtonAction(cameraId: string, data: Omit<OverlayButton, 'id'>) {
    const config = readConfig();
    const newBtn: OverlayButton = { id: uid(), ...data };
    config.cameras = config.cameras.map((c) =>
        c.id === cameraId ? { ...c, buttons: [...c.buttons, newBtn] } : c
    );
    writeConfig(config);
    return newBtn;
}

export async function updateButtonAction(
    cameraId: string,
    buttonId: string,
    data: Partial<Omit<OverlayButton, 'id'>>
) {
    const config = readConfig();
    config.cameras = config.cameras.map((c) =>
        c.id === cameraId
            ? { ...c, buttons: c.buttons.map((b) => (b.id === buttonId ? { ...b, ...data } : b)) }
            : c
    );
    writeConfig(config);
}

export async function deleteButtonAction(cameraId: string, buttonId: string) {
    const config = readConfig();
    config.cameras = config.cameras.map((c) =>
        c.id === cameraId ? { ...c, buttons: c.buttons.filter((b) => b.id !== buttonId) } : c
    );
    writeConfig(config);
}

export async function moveButtonAction(cameraId: string, buttonId: string, x: number, y: number) {
    await updateButtonAction(cameraId, buttonId, { x, y });
}

// ── 攝影機排序與全域設定 ─────────────────────────────

export async function reorderCamerasAction(cameraIds: string[]) {
    const config = readConfig();
    const sorted = cameraIds
        .map(id => config.cameras.find(c => c.id === id))
        .filter((c): c is CameraConfig => !!c);

    config.cameras = sorted;
    writeConfig(config);
}

export async function updateSettingsAction(settings: { columns: number }) {
    const config = readConfig();
    config.settings = settings;
    writeConfig(config);
}
