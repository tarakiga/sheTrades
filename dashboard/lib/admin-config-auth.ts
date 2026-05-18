import {
  ADMIN_API_BASE_URL,
  ADMIN_CONFIG_TOKEN_KEY,
  ADMIN_CONFIG_TOKEN_UPDATED_EVENT,
  getStoredAdminAuthToken,
  saveStoredAdminAuthToken
} from "./admin-auth";

export const ADMIN_CONFIG_API_BASE_URL = ADMIN_API_BASE_URL;
export { ADMIN_CONFIG_TOKEN_KEY, ADMIN_CONFIG_TOKEN_UPDATED_EVENT };

export function getStoredAdminConfigToken() {
  return getStoredAdminAuthToken();
}

export function saveStoredAdminConfigToken(token: string) {
  saveStoredAdminAuthToken(token);
}
