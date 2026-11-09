import axios from 'axios'

// Render's free tier sleeps after inactivity; the first request can take ~30-60s.
// A generous timeout lets the UI show a "waking up" state instead of failing instantly.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1',
  timeout: 60_000,
})

export interface HealthResponse {
  status: 'ok' | 'degraded'
  service: string
  version: string
  environment: string
  database: 'ok' | 'unavailable'
  timestamp: string
}

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>('/health')
  return data
}
