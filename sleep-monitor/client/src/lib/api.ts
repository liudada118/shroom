/**
 * API 配置与请求工具
 */

// 从注入的端口配置或默认值获取
const ports = (window as any).__PORTS__ || { api: 3001, ws: 3002 };

export const API_BASE = `http://127.0.0.1:${ports.api}`;
export const WS_URL = `ws://127.0.0.1:${ports.ws}`;

export async function apiGet(path: string) {
  const res = await fetch(`${API_BASE}${path}`);
  return res.json();
}

export async function apiPost(path: string, body?: any) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}
