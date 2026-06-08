import { isActivePolicy, policyRoles } from '../emit/shared/modules.js'
import { idParam, csrfParam, tenantParam, jsonRequest, jsonResponse, jsonEnvelope, errorResponse, ref } from './schema_builders.js'

export function listOperation(entity, action, tenancy) {
  return tenanted(secureAction(action, false, {
    tags: [entity.id],
    operationId: action.id,
    summary: `List ${entity.id} records`,
    responses: {
      200: jsonResponse({
        type: 'array',
        items: ref(entity.id),
      }),
      403: errorResponse(),
    },
  }), tenancy)
}

export function createOperation(entity, action, tenancy) {
  return tenanted(secureAction(action, true, {
    tags: [entity.id],
    operationId: action.id,
    summary: `Create ${entity.id}`,
    requestBody: jsonRequest(ref(`${entity.id}Input`)),
    responses: {
      201: jsonEnvelope(ref(entity.id)),
      400: errorResponse(),
      403: errorResponse(),
    },
  }), tenancy)
}

export function getOperation(entity, action, tenancy) {
  return tenanted(secureAction(action, false, {
    tags: [entity.id],
    operationId: action.id,
    summary: `Get ${entity.id}`,
    parameters: [idParam()],
    responses: {
      200: jsonEnvelope(ref(entity.id)),
      403: errorResponse(),
      404: errorResponse(),
    },
  }), tenancy)
}

export function updateOperation(entity, action, tenancy) {
  return tenanted(secureAction(action, true, {
    tags: [entity.id],
    operationId: action.id,
    summary: `Update ${entity.id}`,
    parameters: [idParam()],
    requestBody: jsonRequest(ref(`${entity.id}Patch`)),
    responses: {
      200: jsonEnvelope(ref(entity.id)),
      400: errorResponse(),
      403: errorResponse(),
      404: errorResponse(),
    },
  }), tenancy)
}

export function deleteOperation(entity, action, tenancy) {
  return tenanted(secureAction(action, true, {
    tags: [entity.id],
    operationId: action.id,
    summary: `Delete ${entity.id}`,
    parameters: [idParam()],
    responses: {
      200: jsonResponse({
        type: 'object',
        properties: { ok: { type: 'boolean' } },
      }),
      403: errorResponse(),
      404: errorResponse(),
    },
  }), tenancy)
}

export function subscribeOperation(entity, action, tenancy) {
  return tenanted(secureAction(action, false, {
    tags: [entity.id],
    operationId: action.id,
    summary: `Subscribe to ${entity.id} records`,
    responses: {
      200: {
        description: 'Server-sent event stream of record snapshots.',
        content: {
          'text/event-stream': {
            schema: { type: 'string' },
          },
        },
      },
      403: errorResponse(),
    },
  }), tenancy)
}

export function addAuthPaths(spec) {
  spec.paths['/api/auth/login'] = {
    post: {
      tags: ['Auth'],
      operationId: 'login',
      summary: 'Create an IntentStack session',
      requestBody: jsonRequest({
        type: 'object',
        properties: {
          username: { type: 'string' },
          id: { type: 'string' },
          password: { type: 'string', format: 'password' },
        },
      }),
      responses: {
        200: jsonResponse({
          type: 'object',
          properties: {
            token: { type: 'string' },
            csrf_token: { type: 'string' },
            expires_in: { type: 'integer' },
            role: { type: 'string' },
            user: { type: ['string', 'null'] },
          },
        }),
        401: errorResponse(),
      },
    },
  }
  spec.paths['/api/auth/logout'] = {
    post: {
      tags: ['Auth'],
      operationId: 'logout',
      summary: 'Clear the current IntentStack session',
      security: [{ intentstackSession: [] }],
      parameters: [csrfParam()],
      responses: {
        200: jsonResponse({
          type: 'object',
          properties: { ok: { type: 'boolean' } },
        }),
      },
    },
  }
  spec.paths['/api/auth/refresh'] = {
    post: {
      tags: ['Auth'],
      operationId: 'refreshSession',
      summary: 'Rotate the current IntentStack session',
      security: [{ intentstackSession: [] }],
      parameters: [csrfParam()],
      responses: {
        200: jsonResponse({
          type: 'object',
          properties: {
            token: { type: 'string' },
            csrf_token: { type: 'string' },
            expires_in: { type: 'integer' },
            rotated: { type: 'boolean' },
          },
        }),
        401: errorResponse(),
      },
    },
  }
  spec.paths['/api/auth/me'] = {
    get: {
      tags: ['Auth'],
      operationId: 'me',
      summary: 'Read current session metadata',
      responses: {
        200: jsonResponse({
          type: 'object',
          properties: {
            authenticated: { type: 'boolean' },
            role: { type: ['string', 'null'] },
            user: { type: ['string', 'null'] },
          },
        }),
      },
    },
  }
}

export function addObservabilityPaths(spec) {
  spec.paths['/api/health'] = {
    get: {
      tags: ['Observability'],
      operationId: 'health',
      summary: 'Read generated app health status',
      responses: {
        200: jsonResponse({
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
          },
        }),
      },
    },
  }
  spec.paths['/api/metrics'] = {
    get: {
      tags: ['Observability'],
      operationId: 'metrics',
      summary: 'Read generated app runtime metrics',
      responses: {
        200: jsonResponse({
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            uptime_seconds: { type: 'number' },
            started_at: { type: 'string', format: 'date-time' },
            requests_total: { type: 'integer' },
          },
        }),
      },
    },
  }
}

function secureAction(action, csrf, operation) {
  if (!isActivePolicy(action?.auth)) return operation
  const roles = policyRoles(action?.auth)
  const secured = {
    ...operation,
    security: [{ intentstackSession: [] }],
    'x-intentstack-roles': roles,
  }
  if (csrf) secured.parameters = [...(operation.parameters || []), csrfParam()]
  return secured
}

export function tenanted(operation, tenancy) {
  if (!tenancy) return operation
  return {
    ...operation,
    parameters: [...(operation.parameters || []), tenantParam(tenancy)],
    responses: {
      ...operation.responses,
      400: operation.responses?.[400] || errorResponse(),
    },
  }
}
