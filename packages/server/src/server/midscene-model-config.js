import process from 'node:process';
import { overrideAIConfig } from '@midscene/web/bridge-mode';

export function applyModelConfigToMidscene(config) {
  const apiKey = config?.apiKey?.trim() || '';
  const baseUrl = config?.baseUrl?.trim() || '';
  const modelName = config?.chatModelName?.trim() || '';
  const modelFamily = config?.chatModelFamily?.trim() || '';

  if (apiKey) {
    process.env.MIDSCENE_MODEL_API_KEY = apiKey;
  }
  if (baseUrl) {
    process.env.MIDSCENE_MODEL_BASE_URL = baseUrl;
  }
  if (modelName) {
    process.env.MIDSCENE_MODEL_NAME = modelName;
  }
  if (modelFamily) {
    process.env.MIDSCENE_MODEL_FAMILY = modelFamily;
  }

  overrideAIConfig({
    MIDSCENE_MODEL_API_KEY: apiKey,
    MIDSCENE_MODEL_BASE_URL: baseUrl,
    MIDSCENE_MODEL_NAME: modelName,
    MIDSCENE_MODEL_FAMILY: modelFamily,
  });
}
