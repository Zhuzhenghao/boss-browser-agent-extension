import { sendJson } from '../http.js';
import { getModelConfig, saveModelConfig } from '../model-config-store.js';
import { applyModelConfigToMidscene } from '../midscene-model-config.js';

function validateModelConfig(config) {
  if (!config.apiKey?.trim()) {
    return '请先配置模型 API Key';
  }
  if (!config.baseUrl?.trim()) {
    return '请先配置模型 Base URL';
  }
  if (!config.chatModelName?.trim()) {
    return '请先配置对话模型名称';
  }
  if (!config.chatModelFamily?.trim()) {
    return '请先配置模型家族';
  }
  return '';
}

export function handleGetModelConfig(res) {
  const config = getModelConfig();
  sendJson(res, 200, { ok: true, data: config });
}

export function handleSaveModelConfig(req, res) {
  const { config: body } = req.body || {};
  if (!body || typeof body !== 'object') {
    sendJson(res, 400, { ok: false, error: 'config 必须是对象' });
    return;
  }
  const validationError = validateModelConfig(body);
  if (validationError) {
    sendJson(res, 400, { ok: false, error: validationError });
    return;
  }
  const saved = saveModelConfig(body);
  applyModelConfigToMidscene(saved);
  sendJson(res, 200, { ok: true, data: saved });
}
