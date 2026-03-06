import fs from 'fs';
import path from 'path';
import type { AppConfig } from '@/types/camera';

// 儲存在專案根目錄的 data/config.json
const CONFIG_PATH = path.join(process.cwd(), 'data', 'config.json');

const DEFAULT_CONFIG: AppConfig = {
    cameras: [],
    settings: { columns: 2 }
};

export function readConfig(): AppConfig {
    try {
        if (!fs.existsSync(CONFIG_PATH)) {
            writeConfig(DEFAULT_CONFIG);
            return DEFAULT_CONFIG;
        }
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        return JSON.parse(raw) as AppConfig;
    } catch {
        return DEFAULT_CONFIG;
    }
}

export function writeConfig(config: AppConfig): void {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
