import { ACTION_TYPES, COMPONENT_TYPES, FIELD_TYPES, TARGETS } from './registry.js'

export function intentSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://intentstack.local/schemas/intent.v0.1.schema.json',
    title: 'IntentStack Intent DSL v0.1',
    type: 'object',
    additionalProperties: false,
    required: ['version', 'project', 'pages'],
    properties: {
      version: { enum: [0.1, '0.1'] },
      project: {
        type: 'object',
        additionalProperties: true,
        required: ['id', 'target'],
        properties: {
          id: { type: 'string', minLength: 1 },
          name: { type: 'string' },
          target: { enum: Object.keys(TARGETS) },
        },
      },
      theme: {
        type: 'object',
        additionalProperties: true,
        properties: {
          preset: { type: 'string' },
          radius: { enum: ['none', 'sm', 'md', 'lg', 'xl', 'full'] },
          density: { enum: ['compact', 'comfortable', 'spacious'] },
          color: { type: 'string' },
        },
      },
      navigation: {
        type: 'object',
        additionalProperties: true,
        properties: {
          enabled: { type: 'boolean' },
          logo: { type: 'string' },
          items: {
            type: 'array',
            items: navigationItemSchema(),
          },
        },
      },
      auth: {
        anyOf: [
          { type: 'boolean' },
          { const: 'reserved' },
          {
            type: 'object',
            additionalProperties: true,
            properties: {
              roles: {
                type: 'array',
                items: {
                  anyOf: [
                    { type: 'string' },
                    {
                      type: 'object',
                      additionalProperties: true,
                      required: ['id'],
                      properties: { id: { type: 'string', minLength: 1 }, label: { type: 'string' } },
                    },
                  ],
                },
              },
              users: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: true,
                  required: ['id', 'password'],
                  properties: {
                    id: { type: 'string', minLength: 1 },
                    role: { type: 'string' },
                    password: { type: 'string', pattern: '^env:' },
                  },
                },
              },
            },
          },
        ],
      },
      entities: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,
          required: ['id'],
          properties: {
            id: { type: 'string', minLength: 1 },
            table: { type: 'string' },
            fields: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true,
                required: ['id', 'type'],
                properties: {
                  id: { type: 'string', minLength: 1 },
                  type: { enum: FIELD_TYPES },
                  label: { type: 'string' },
                  required: { type: 'boolean' },
                  values: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
      },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,
          required: ['id', 'type'],
          properties: {
            id: { type: 'string', minLength: 1 },
            type: { enum: ACTION_TYPES },
            entity: { type: 'string' },
            auth: authPolicySchema(),
          },
        },
      },
      pages: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,
          required: ['id', 'path'],
          properties: {
            id: { type: 'string', minLength: 1 },
            path: { type: 'string' },
            layout: { type: 'string' },
            navigation: { type: 'boolean' },
            title: { type: 'string' },
            auth: authPolicySchema(),
            sections: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true,
                required: ['id', 'type'],
                properties: {
                  id: { type: 'string', minLength: 1 },
                  type: { enum: COMPONENT_TYPES },
                  blocks: {
                    type: 'array',
                    items: contentBlockSchema(),
                  },
                },
              },
            },
          },
        },
      },
      integrations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,
          required: ['id', 'type'],
          properties: {
            id: { type: 'string', minLength: 1 },
            type: { enum: ['webhook', 'email', 'crm', 'telegram', 'whatsapp', 'payment', 'external_api'] },
            config: { type: 'object', additionalProperties: true },
          },
        },
      },
      workflows: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,
          required: ['id', 'trigger'],
          properties: {
            id: { type: 'string', minLength: 1 },
            trigger: {
              type: 'object',
              additionalProperties: true,
              required: ['action'],
              properties: { action: { type: 'string' } },
            },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true,
                required: ['type'],
                properties: {
                  type: { enum: ['email', 'webhook', 'background_job', 'state_transition', 'approval'] },
                  integration: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }
}

function navigationItemSchema() {
  return {
    type: 'object',
    additionalProperties: true,
    required: ['label', 'href'],
    properties: {
      label: { type: 'string', minLength: 1 },
      href: { type: 'string', minLength: 1 },
    },
  }
}

function contentBlockSchema() {
  return {
    type: 'object',
    additionalProperties: true,
    required: ['type'],
    properties: {
      id: { type: 'string' },
      type: { enum: ['heading', 'paragraph', 'list', 'code'] },
      level: { type: 'number' },
      text: { type: 'string' },
      language: { type: 'string' },
      code: { type: 'string' },
      items: { type: 'array', items: { type: 'string' } },
    },
  }
}

function authPolicySchema() {
  return {
    anyOf: [
      { type: 'boolean' },
      { const: 'reserved' },
      { type: 'string' },
      { type: 'array', items: { type: 'string' } },
      {
        type: 'object',
        additionalProperties: true,
        properties: {
          role: { type: 'string' },
          roles: { type: 'array', items: { type: 'string' } },
        },
      },
    ],
  }
}
