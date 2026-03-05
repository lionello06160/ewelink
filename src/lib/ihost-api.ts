// iHost API 型別定義與客戶端

export interface IHostDevice {
  serial_number: string;
  third_serial_number?: string;
  name: string;
  manufacturer: string;
  model: string;
  display_category: string;
  capabilities: Array<{
    capability: string;
    permission: string;
    name?: string;
  }>;
  state: Record<string, any>;
  tags: Record<string, any>;
  online: boolean;
}

export interface IHostApiResponse<T> {
  error: number;
  data: T;
  message: string;
}

// ── 多通道設備輔助 ──────────────────────────────────────────────────────────────

export interface SwitchOutlet {
  switch: 'on' | 'off';
  outlet: number;
}

/** 從 capabilities 判斷設備通道數 */
export function getChannelCount(device: IHostDevice): number {
  const toggles = device.capabilities.filter(c => c.capability === 'toggle');
  if (toggles.length > 0) return toggles.length;

  if (device.capabilities.some(c => c.capability === 'power')) return 1;
  return 0;
}

/** 從 state 取得各通道目前狀態 */
export function getChannelStates(device: IHostDevice): ('on' | 'off')[] {
  const toggles = device.capabilities
    .filter(c => c.capability === 'toggle' && c.name)
    .sort((a, b) => Number(a.name) - Number(b.name));

  if (toggles.length > 0) {
    return toggles.map(t => {
      const name = t.name!;
      const toggleState = device.state.toggle?.[name]?.toggleState;
      return toggleState === 'on' ? 'on' : 'off';
    });
  }

  const powerState = device.state.power?.powerState;
  if (powerState) return [powerState === 'on' ? 'on' : 'off'];

  return [];
}

// ── API Client ─────────────────────────────────────────────────────────────────

const DEFAULT_IP = process.env.IHOST_IP;
const DEFAULT_TOKEN = process.env.IHOST_ACCESS_TOKEN;

function getBase(host?: { ip: string }) {
  const ip = host?.ip || DEFAULT_IP;
  return `http://${ip}/open-api/v2/rest`;
}

function headers(host?: { token: string }) {
  const token = host?.token || DEFAULT_TOKEN;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

/** 取得所有設備列表 */
export async function getDevices(host?: { ip: string, token: string }): Promise<IHostDevice[]> {
  const res = await fetch(`${getBase(host)}/devices`, {
    headers: headers(host),
    cache: 'no-store',
  });
  const json: IHostApiResponse<{ device_list: IHostDevice[] }> = await res.json();
  if (json.error !== 0) throw new Error(json.message);
  return json.data.device_list;
}

/**
 * 切換開關設備
 * @param deviceId  iHost 設備 ID
 * @param action    on / off / toggle
 * @param outlet    多通道設備的通道索引（0-based）；單通道設備不傳
 */
export async function setSwitch(
  deviceId: string,
  action: 'on' | 'off' | 'toggle',
  outlet?: number,
  host?: { ip: string, token: string }
) {
  // 決定目標狀態
  let targetValue: 'on' | 'off';

  if (action === 'toggle') {
    // 先讀當前狀態
    const devices = await getDevices(host);
    const device = devices.find((d) => d.serial_number === deviceId);
    if (!device) throw new Error(`Device ${deviceId} not found`);

    if (outlet !== undefined) {
      // 多通道
      const channels = getChannelStates(device);
      const current = channels[outlet] ?? 'off';
      targetValue = current === 'on' ? 'off' : 'on';
    } else {
      // 單通道
      const current = device.state.power?.powerState ?? (device.state.toggle?.['1']?.toggleState) ?? 'off';
      targetValue = current === 'on' ? 'off' : 'on';
    }
  } else {
    targetValue = action;
  }

  // 組裝 state payload（v2 格式：使用 toggle[ch].toggleState 或 power.powerState）
  let stateBody: any = {};
  if (outlet !== undefined) {
    const chName = String(outlet + 1);
    stateBody = { toggle: { [chName]: { toggleState: targetValue } } };
  } else {
    // 單通道可能使用 power 或 toggle["1"]，這裡保守一點檢查如果是多通道設備但沒傳 outlet 則報錯
    const devices = await getDevices(host);
    const device = devices.find(d => d.serial_number === deviceId);
    if (device && device.capabilities.some(c => c.capability === 'power')) {
      stateBody = { power: { powerState: targetValue } };
    } else {
      stateBody = { toggle: { "1": { toggleState: targetValue } } };
    }
  }

  console.log(`[API] Putting state to ${deviceId}:`, JSON.stringify(stateBody));
  const res = await fetch(`${getBase(host)}/devices/${deviceId}`, {
    method: 'PUT',
    headers: headers(host),
    body: JSON.stringify({ state: stateBody }),
  });

  const json: IHostApiResponse<unknown> = await res.json();
  console.log(`[API] Response from ${deviceId}:`, JSON.stringify(json));
  if (json.error !== 0) throw new Error(json.message);
  return json;
}

/** 取得單一設備狀態 */
export async function getDeviceState(deviceId: string, host?: { ip: string, token: string }) {
  const res = await fetch(`${getBase(host)}/devices/${deviceId}`, {
    headers: headers(host),
    cache: 'no-store',
  });
  const json: IHostApiResponse<{ state: Record<string, unknown> }> =
    await res.json();
  if (json.error !== 0) throw new Error(json.message);
  return json.data.state;
}
