import { create } from 'zustand';
import type { CameraConfig, OverlayButton, AppSettings, IHostConfig } from '@/types/camera';
import {
    getConfigAction,
    addCameraAction,
    updateCameraAction,
    deleteCameraAction,
    addButtonAction,
    updateButtonAction,
    deleteButtonAction,
    moveButtonAction,
    reorderCamerasAction,
    updateSettingsAction,
} from '@/app/actions/config';

interface ConfigState {
    cameras: CameraConfig[];
    settings: AppSettings;
    hosts: IHostConfig[];
    loaded: boolean;

    // 從 JSON 檔案載入（在 app 初始化時呼叫）
    loadConfig: () => Promise<void>;

    // ── Camera CRUD ────────────────────────────────
    addCamera: (data: {
        name: string;
        streamPath: string;
        streamHostId?: string;
        backgroundImage?: string;
    }) => Promise<void>;
    updateCamera: (id: string, data: {
        name: string;
        streamPath: string;
        streamHostId?: string;
        backgroundImage?: string;
    }) => Promise<void>;
    deleteCamera: (id: string) => Promise<void>;
    moveCamera: (id: string, direction: 'up' | 'down') => Promise<void>;

    // ── Button CRUD ────────────────────────────────
    addButton: (cameraId: string, data: Omit<OverlayButton, 'id'>) => Promise<void>;
    updateButton: (cameraId: string, buttonId: string, data: Partial<Omit<OverlayButton, 'id'>>) => Promise<void>;
    deleteButton: (cameraId: string, buttonId: string) => Promise<void>;
    moveButton: (cameraId: string, buttonId: string, x: number, y: number) => Promise<void>;

    // ── Global Settings ───────────────────────────
    updateSettings: (settings: AppSettings) => Promise<void>;
}

export const useConfigStore = create<ConfigState>()((set, get) => ({
    cameras: [],
    settings: { columns: 2 },
    hosts: [],
    loaded: false,

    loadConfig: async () => {
        if (get().loaded) return;
        const { cameras, settings, hosts } = await getConfigAction();
        set({ cameras, settings, hosts, loaded: true });
    },

    // ── Camera operations ──
    addCamera: async (data) => {
        const newCam = await addCameraAction(data);
        set((s) => ({ cameras: [...s.cameras, newCam] }));
    },

    updateCamera: async (id, data) => {
        // 樂觀更新 UI
        set((s) => ({
            cameras: s.cameras.map((c) => (c.id === id ? { ...c, ...data } : c)),
        }));
        await updateCameraAction(id, data);
    },

    deleteCamera: async (id) => {
        set((s) => ({ cameras: s.cameras.filter((c) => c.id !== id) }));
        await deleteCameraAction(id);
    },

    moveCamera: async (id, direction) => {
        const { cameras } = get();
        const idx = cameras.findIndex(c => c.id === id);
        if (idx === -1) return;

        const newCameras = [...cameras];
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= newCameras.length) return;

        [newCameras[idx], newCameras[targetIdx]] = [newCameras[targetIdx], newCameras[idx]];
        set({ cameras: newCameras });
        await reorderCamerasAction(newCameras.map(c => c.id));
    },

    // ── Button operations ──
    // ... 略過 (保持原樣)
    addButton: async (cameraId, data) => {
        const newBtn = await addButtonAction(cameraId, data);
        set((s) => ({
            cameras: s.cameras.map((c) =>
                c.id === cameraId ? { ...c, buttons: [...c.buttons, newBtn] } : c
            ),
        }));
    },
    updateButton: async (cameraId, buttonId, data) => {
        set((s) => ({
            cameras: s.cameras.map((c) =>
                c.id === cameraId
                    ? { ...c, buttons: c.buttons.map((b) => (b.id === buttonId ? { ...b, ...data } : b)) }
                    : c
            ),
        }));
        await updateButtonAction(cameraId, buttonId, data);
    },
    deleteButton: async (cameraId, buttonId) => {
        set((s) => ({
            cameras: s.cameras.map((c) =>
                c.id === cameraId ? { ...c, buttons: c.buttons.filter((b) => b.id !== buttonId) } : c
            ),
        }));
        await deleteButtonAction(cameraId, buttonId);
    },
    moveButton: async (cameraId, buttonId, x, y) => {
        set((s) => ({
            cameras: s.cameras.map((c) =>
                c.id === cameraId
                    ? { ...c, buttons: c.buttons.map((b) => (b.id === buttonId ? { ...b, x, y } : b)) }
                    : c
            ),
        }));
        await moveButtonAction(cameraId, buttonId, x, y);
    },

    // ── Global Settings ──
    updateSettings: async (settings) => {
        set({ settings });
        await updateSettingsAction(settings);
    },
}));
