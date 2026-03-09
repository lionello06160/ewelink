// 疊加按鈕的設定型別

export interface IHostConfig {
    id: string;
    name: string;
    ip: string;
    lanIp?: string;
    token?: string;
}

export type SwitchAction = 'on' | 'off' | 'toggle';

export interface OverlayButton {
    id: string;
    label: string;
    icon?: string; // emoji
    deviceId: string;        // iHost 設備 ID
    action: SwitchAction;
    /**
     * 多通道設備的通道索引（0-based）。
     * undefined = 單通道設備，使用 { switch: ... } 格式。
     * 0/1/2/3   = 多通道設備，使用 { switches: [{ switch: ..., outlet: N }] } 格式。
     */
    outlet?: number;
    // 位置（百分比，相對於影像容器）
    x: number; // 0-100
    y: number; // 0-100
    // 顏色主題
    variant?: 'default' | 'danger' | 'success' | 'warning';
    // 縮放大小 (1 為預設)
    scale?: number;
    // 所屬 iHost ID (若未指定則使用預設)
    hostId?: string;
}

export interface CameraConfig {
    id: string;
    name: string;
    // mediamtx WHEP 串流路徑名稱（例如 "cam-b1p"）
    streamPath: string;
    // 串流所屬 iHost ID (若未指定則使用預設主機)
    streamHostId?: string;
    backgroundImage?: string; // 編輯時的參考背景圖 (DataURL 或 URL)
    buttons: OverlayButton[];
}

export interface AppSettings {
    columns: number; // 首頁欄數
}

export interface AppConfig {
    cameras: CameraConfig[];
    settings?: AppSettings;
}
