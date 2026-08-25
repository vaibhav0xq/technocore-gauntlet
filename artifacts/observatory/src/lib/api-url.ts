import { setBaseUrl } from '@workspace/api-client-react';

function readApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_URL?.trim();
  if (!configuredUrl) return '';

  const parsedUrl = new URL(configuredUrl);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('VITE_API_URL must use HTTP or HTTPS');
  }

  if (
    parsedUrl.pathname !== '/' ||
    parsedUrl.search ||
    parsedUrl.hash ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error('VITE_API_URL must contain only the API origin');
  }

  return parsedUrl.origin;
}

export const apiBaseUrl = readApiBaseUrl();

export function configureApiClient() {
  if (apiBaseUrl) {
    setBaseUrl(apiBaseUrl);
  }
}

export function getApiUrl(path: string) {
  if (!path.startsWith('/')) {
    throw new Error('API paths must start with a slash');
  }

  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
}