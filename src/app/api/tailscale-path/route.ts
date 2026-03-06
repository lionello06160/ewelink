import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';

const execFileAsync = promisify(execFile);

function getHostById(hostId: string) {
    const prefixes = [
        { id: 'default', prefix: 'IHOST' },
        ...Array.from({ length: 4 }, (_, idx) => ({ id: `host${idx + 2}`, prefix: `IHOST${idx + 2}` })),
    ];

    const entry = prefixes.find((item) => item.id === hostId);
    if (!entry) return null;

    const ip = process.env[`${entry.prefix}_IP`];
    const tailscaleIp = process.env[`${entry.prefix}_TAILSCALE_IP`] ?? ip;
    return tailscaleIp ? { tailscaleIp } : null;
}

function parsePath(output: string): 'direct' | 'relay' | 'unknown' {
    if (/via DERP|via derp|relay/i.test(output)) return 'relay';
    if (/via\s+\d{1,3}(?:\.\d{1,3}){3}:\d+/i.test(output)) return 'direct';
    return 'unknown';
}

function parseLatencyMs(output: string): number | null {
    const match = output.match(/in\s+(\d+(?:\.\d+)?)ms/i);
    if (!match) return null;
    return Math.round(Number(match[1]));
}

export async function GET(request: NextRequest) {
    const hostId = request.nextUrl.searchParams.get('hostId') ?? 'default';
    const host = getHostById(hostId);

    if (!host) {
        return NextResponse.json({ status: 'unknown', reason: 'host-not-configured' }, { status: 404 });
    }

    try {
        const { stdout, stderr } = await execFileAsync('tailscale', ['ping', '-c', '1', host.tailscaleIp], {
            timeout: 4000,
        });
        const raw = `${stdout}\n${stderr}`.trim();
        return NextResponse.json({
            status: parsePath(raw),
            latencyMs: parseLatencyMs(raw),
            raw,
            checkedAt: new Date().toISOString(),
        });
    } catch (error) {
        const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr ?? '') : '';
        const stdout = error && typeof error === 'object' && 'stdout' in error ? String(error.stdout ?? '') : '';
        const raw = `${stdout}\n${stderr}`.trim();
        return NextResponse.json({
            status: parsePath(raw),
            latencyMs: parseLatencyMs(raw),
            raw,
            checkedAt: new Date().toISOString(),
        });
    }
}
