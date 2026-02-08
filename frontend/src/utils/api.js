/**
 * API URL Configuration
 *
 * Handles different deployment scenarios:
 * - Local dev: VITE_API_URL not set, uses '/api' (Vite proxy)
 * - Production: VITE_API_URL is full backend URL, appends '/api' if needed
 */

function getApiUrl() {
  const envUrl = import.meta.env.VITE_API_URL;

  // Local development: use Vite proxy
  if (!envUrl) {
    return '/api';
  }

  // Production: ensure /api suffix exists
  const baseUrl = envUrl.replace(/\/$/, ''); // Remove trailing slash

  // If it's a full URL (http/https) and doesn't end with /api, append it
  if (baseUrl.startsWith('http') && !baseUrl.endsWith('/api')) {
    return `${baseUrl}/api`;
  }

  return baseUrl;
}

export const API_URL = getApiUrl();
