// ────────────────────────────────────────────
// File: src/api/users.ts
// ────────────────────────────────────────────
import { request } from '../lib/apiClient';
import { type UserCreate, type UserRead } from '../types/openapi';

/** Users */
export const listUsers = () =>
  request<UserRead[]>({ method: 'GET', url: '/users/' });
export const createUser = (body: UserCreate) =>
  request<UserRead, UserCreate>({ method: 'POST', url: '/users/', data: body });
