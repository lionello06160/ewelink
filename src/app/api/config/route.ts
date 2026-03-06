import { NextRequest, NextResponse } from 'next/server';
import { readConfig, writeConfig } from '@/lib/config-file';
import type { CameraConfig, OverlayButton } from '@/types/camera';

export const runtime = 'nodejs';

const CONFIG_API_KEY = process.env.CONFIG_API_KEY ?? '';

function uid() {
    return Math.random().toString(36).slice(2, 9);
}

function authorize(req: NextRequest) {
    if (!CONFIG_API_KEY) return true;
    return req.headers.get('x-config-key') === CONFIG_API_KEY;
}

export async function GET(req: NextRequest) {
    if (!authorize(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(readConfig());
}

export async function POST(req: NextRequest) {
    if (!authorize(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null) as {
        action?: string;
        payload?: Record<string, any>;
    } | null;

    if (!body?.action) {
        return NextResponse.json({ error: 'Missing action' }, { status: 400 });
    }

    const config = readConfig();

    switch (body.action) {
        case 'addCamera': {
            const data = body.payload?.data as {
                name: string;
                streamPath: string;
                streamHostId?: string;
                backgroundImage?: string;
            };
            const camera: CameraConfig = { id: uid(), ...data, buttons: [] };
            config.cameras.push(camera);
            writeConfig(config);
            return NextResponse.json({ camera });
        }

        case 'updateCamera': {
            const id = body.payload?.id as string;
            const data = body.payload?.data as Partial<CameraConfig>;
            config.cameras = config.cameras.map((camera) => (camera.id === id ? { ...camera, ...data } : camera));
            writeConfig(config);
            return NextResponse.json({ success: true });
        }

        case 'deleteCamera': {
            const id = body.payload?.id as string;
            config.cameras = config.cameras.filter((camera) => camera.id !== id);
            writeConfig(config);
            return NextResponse.json({ success: true });
        }

        case 'addButton': {
            const cameraId = body.payload?.cameraId as string;
            const data = body.payload?.data as Omit<OverlayButton, 'id'>;
            const button: OverlayButton = { id: uid(), ...data };
            config.cameras = config.cameras.map((camera) =>
                camera.id === cameraId ? { ...camera, buttons: [...camera.buttons, button] } : camera
            );
            writeConfig(config);
            return NextResponse.json({ button });
        }

        case 'updateButton': {
            const cameraId = body.payload?.cameraId as string;
            const buttonId = body.payload?.buttonId as string;
            const data = body.payload?.data as Partial<Omit<OverlayButton, 'id'>>;
            config.cameras = config.cameras.map((camera) =>
                camera.id === cameraId
                    ? { ...camera, buttons: camera.buttons.map((button) => (button.id === buttonId ? { ...button, ...data } : button)) }
                    : camera
            );
            writeConfig(config);
            return NextResponse.json({ success: true });
        }

        case 'deleteButton': {
            const cameraId = body.payload?.cameraId as string;
            const buttonId = body.payload?.buttonId as string;
            config.cameras = config.cameras.map((camera) =>
                camera.id === cameraId
                    ? { ...camera, buttons: camera.buttons.filter((button) => button.id !== buttonId) }
                    : camera
            );
            writeConfig(config);
            return NextResponse.json({ success: true });
        }

        case 'moveButton': {
            const cameraId = body.payload?.cameraId as string;
            const buttonId = body.payload?.buttonId as string;
            const x = body.payload?.x as number;
            const y = body.payload?.y as number;
            config.cameras = config.cameras.map((camera) =>
                camera.id === cameraId
                    ? {
                        ...camera,
                        buttons: camera.buttons.map((button) => (button.id === buttonId ? { ...button, x, y } : button)),
                    }
                    : camera
            );
            writeConfig(config);
            return NextResponse.json({ success: true });
        }

        case 'reorderCameras': {
            const cameraIds = body.payload?.cameraIds as string[];
            config.cameras = cameraIds
                .map((id) => config.cameras.find((camera) => camera.id === id))
                .filter((camera): camera is CameraConfig => Boolean(camera));
            writeConfig(config);
            return NextResponse.json({ success: true });
        }

        case 'updateSettings': {
            config.settings = body.payload?.settings;
            writeConfig(config);
            return NextResponse.json({ success: true });
        }

        default:
            return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
}
