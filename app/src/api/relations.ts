// ────────────────────────────────────────────
// File: src/api/relations.ts
// REST helpers for Relation endpoints
// ────────────────────────────────────────────
import { request } from '../lib/apiClient';
import {
    type RelationRead,
    type RelationCreate,
    type RelationAssign,
} from '../types/openapi';

/** List relations (optionally filtered by one or both table IDs). */
export const listRelations = (
    leftTableId?: string,
    rightTableId?: string,
) => {
    const params = new URLSearchParams();
    if (leftTableId) params.append('left_table_id', leftTableId);
    if (rightTableId) params.append('right_table_id', rightTableId);
    const query = params.toString() ? `?${params.toString()}` : '';

    return request<RelationRead[]>({
        method: 'GET',
        url: `/relations/${query}`,
    });
};

/** Create a new relation definition (between two tables). */
export const addRelation = (body: RelationCreate) =>
    request<RelationRead, RelationCreate>({
        method: 'POST',
        url: '/relations/',
        data: body,
    });

/** Permanently delete a relation definition by its UUID. */
export const deleteRelation = (relationId: string) =>
    request<void>({
        method: 'DELETE',
        url: `/relations/${relationId}/`,
    });

/** Link two row items through an existing relation. */
export const assignRelation = (
    relationId: string,
    payload: Omit<RelationAssign, 'relation_id'>,
) =>
    request<void, RelationAssign>({
        method: 'POST',
        url: `/relations/${relationId}/assign`,
        data: payload,
    });

export const unAssignRelation = (
    relationId: string,
    payload: Omit<RelationAssign, 'relation_id'>,
) =>
    request<void, RelationAssign>({
        method: 'POST',
        url: `/relations/${relationId}/unassign`,
        data: payload,
    });
