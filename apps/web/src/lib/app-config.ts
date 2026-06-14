export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1";

export const REALTIME_URL =
  process.env.NEXT_PUBLIC_REALTIME_URL ??
  API_BASE_URL.replace(/\/api\/v\d+$/, "/notifications");
