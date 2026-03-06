'use server';

import { readConfig, writeConfig } from '@/lib/config-file';
import type { CameraConfig, OverlayButton } from '@/types/camera';

const CONFIG_MASTER_URL = process.env.CONFIG_MASTER_URL?.replace(/\/$/, '');
const CONFIG_API_KEY = process.env.CONFIG_API_KEY ?? '';

function uid() {
    return Math.random().toString(36).slice(2, 9);
}

function buildHosts() {
    const hosts: Array<{ id: string, name: string, ip: string, lanIp?: string, tailscaleIp?: string }> = [];
    const pushHost = (id: string, fallbackName: string, prefix = 'IHOST') => {
        const apiIp = process.env[`${prefix}_IP`];
        const lanIp = process.env[`${prefix}_LAN_IP`];
        const tailscaleIp = process.env[`${prefix}_TAILSCALE_IP`] ?? apiIp;
        const name = process.env[`${prefix}_NAME`] ?? fallbackName;

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
    for (let i = 2; i <= 5; i++) {
        pushHost(`host${i}`, `主機 ${i} (.env)`, `IHOST${i}`);
    }

    return hosts;
}

async function fetchMasterConfig() {
    if (!CONFIG_MASTER_URL) return null;
    const res = await fetch(`${CONFIG_MASTER_URL}/api/config`, {
        method: 'GET',
        headers: {
            'x-config-key': CONFIG_API_KEY,
        },
        cache: 'no-store',
    });

    if (!res.ok) {
        throw new Error(`Config master GET failed: ${res.status}`);
    }

    return res.json();
}

async function mutateMasterConfig(action: string, payload: Record<string, unknown>) {
    if (!CONFIG_MASTER_URL) return null;
    const res = await fetch(`${CONFIG_MASTER_URL}/api/config`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-config-key': CONFIG_API_KEY,
        },
        body: JSON.stringify({ action, payload }),
        cache: 'no-store',
    });

    if (!res.ok) {
        throw new Error(`Config master POST failed: ${res.status}`);
    }

    return res.json();
}

// ── 讀取全部設定 ──────────────────────────────────
export async function getConfigAction() {
    const hosts = buildHosts();
    const config = CONFIG_MASTER_URL
        ? await fetchMasterConfig()
        : readConfig();

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
    if (CONFIG_MASTER_URL) {
        const result = await mutateMasterConfig('addCamera', { data });
        return result.camera as CameraConfig;
    }

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
    if (CONFIG_MASTER_URL) {
        await mutateMasterConfig('updateCamera', { id, data });
        return;
    }

    const config = readConfig();
    config.cameras = config.cameras.map((c) => (c.id === id ? { ...c, ...data } : c));
    writeConfig(config);
}

export async function deleteCameraAction(id: string) {
    if (CONFIG_MASTER_URL) {
        await mutateMasterConfig('deleteCamera', { id });
        return;
    }

    const config = readConfig();
    config.cameras = config.cameras.filter((c) => c.id !== id);
    writeConfig(config);
}

// ── 按鈕 CRUD ──────────────────────────────────────

export async function addButtonAction(cameraId: string, data: Omit<OverlayButton, 'id'>) {
    if (CONFIG_MASTER_URL) {
        const result = await mutateMasterConfig('addButton', { cameraId, data });
        return result.button as OverlayButton;
    }

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
    if (CONFIG_MASTER_URL) {
        await mutateMasterConfig('updateButton', { cameraId, buttonId, data });
        return;
    }

    const config = readConfig();
    config.cameras = config.cameras.map((c) =>
        c.id === cameraId
            ? { ...c, buttons: c.buttons.map((b) => (b.id === buttonId ? { ...b, ...data } : b)) }
            : c
    );
    writeConfig(config);
}

export async function deleteButtonAction(cameraId: string, buttonId: string) {
    if (CONFIG_MASTER_URL) {
        await mutateMasterConfig('deleteButton', { cameraId, buttonId });
        return;
    }

    const config = readConfig();
    config.cameras = config.cameras.map((c) =>
        c.id === cameraId ? { ...c, buttons: c.buttons.filter((b) => b.id !== buttonId) } : c
    );
    writeConfig(config);
}

export async function moveButtonAction(cameraId: string, buttonId: string, x: number, y: number) {
    if (CONFIG_MASTER_URL) {
        await mutateMasterConfig('moveButton', { cameraId, buttonId, x, y });
        return;
    }

    await updateButtonAction(cameraId, buttonId, { x, y });
}

// ── 攝影機排序與全域設定 ─────────────────────────────

export async function reorderCamerasAction(cameraIds: string[]) {
    if (CONFIG_MASTER_URL) {
        await mutateMasterConfig('reorderCameras', { cameraIds });
        return;
    }

    const config = readConfig();
    const sorted = cameraIds
        .map(id => config.cameras.find(c => c.id === id))
        .filter((c): c is CameraConfig => !!c);

    config.cameras = sorted;
    writeConfig(config);
}

export async function updateSettingsAction(settings: { columns: number }) {
    if (CONFIG_MASTER_URL) {
        await mutateMasterConfig('updateSettings', { settings });
        return;
    }

    const config = readConfig();
    config.settings = settings;
    writeConfig(config);
}
