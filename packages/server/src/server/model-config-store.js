import { getDb } from '../agents/services/db.js';

const DEFAULT_CONFIG_ID = 'default';

function getDefaultModelConfig() {
  const now = new Date().toISOString();
  return {
    id: DEFAULT_CONFIG_ID,
    providerType: 'openai-compatible',
    apiKey: '',
    baseUrl: '',
    chatModelName: '',
    chatModelFamily: '',
    textModelName: 'qwen-plus',
    createdAt: now,
    updatedAt: now,
  };
}

function mapRow(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    providerType: row.provider_type,
    apiKey: row.api_key,
    baseUrl: row.base_url,
    chatModelName: row.chat_model_name,
    chatModelFamily: row.chat_model_family,
    textModelName: row.text_model_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeModelConfig(config) {
  return {
    id: DEFAULT_CONFIG_ID,
    providerType: 'openai-compatible',
    apiKey: (config.apiKey || '').trim(),
    baseUrl: (config.baseUrl || '').trim(),
    chatModelName: (config.chatModelName || '').trim(),
    chatModelFamily: (config.chatModelFamily || '').trim(),
    textModelName: (config.textModelName || 'qwen-plus').trim() || 'qwen-plus',
    gatewayApiKey: '',
    gatewayModel: '',
  };
}

export function getModelConfig() {
  const db = getDb();
  const row = db.prepare('SELECT * FROM model_configs WHERE id = ?').get(DEFAULT_CONFIG_ID);
  if (row) {
    return mapRow(row);
  }
  return getDefaultModelConfig();
}

export function saveModelConfig(config) {
  const db = getDb();
  const now = new Date().toISOString();
  const normalized = {
    ...normalizeModelConfig(config),
    updatedAt: now,
  };

  db.prepare(`
    INSERT INTO model_configs (id, provider_type, api_key, base_url, chat_model_name, chat_model_family, text_model_name, gateway_api_key, gateway_model, created_at, updated_at)
    VALUES (@id, @providerType, @apiKey, @baseUrl, @chatModelName, @chatModelFamily, @textModelName, @gatewayApiKey, @gatewayModel, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      provider_type = excluded.provider_type,
      api_key = excluded.api_key,
      base_url = excluded.base_url,
      chat_model_name = excluded.chat_model_name,
      chat_model_family = excluded.chat_model_family,
      text_model_name = excluded.text_model_name,
      gateway_api_key = excluded.gateway_api_key,
      gateway_model = excluded.gateway_model,
      updated_at = excluded.updated_at
  `).run({
    ...normalized,
    createdAt: getModelConfig().createdAt || now,
    updatedAt: now,
  });

  return getModelConfig();
}
