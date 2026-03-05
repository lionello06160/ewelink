'use client';

import { useEffect } from 'react';
import { useConfigStore } from '@/store/config-store';

/**
 * 放在頁面頂層，負責從 config.json 載入設定到 store。
 * 只會在第一次 mount 時執行（loaded 旗標防止重複載入）。
 */
export function ConfigLoader() {
    const loadConfig = useConfigStore((s) => s.loadConfig);

    useEffect(() => {
        loadConfig();
    }, [loadConfig]);

    return null;
}
