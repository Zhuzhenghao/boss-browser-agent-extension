import process from 'node:process';

let overrideAiConfigLoader = null;

async function getOverrideAIConfig() {
  if (!overrideAiConfigLoader) {
    overrideAiConfigLoader = import('@midscene/web/bridge-mode')
      .then(module => module.overrideAIConfig);
  }

  return overrideAiConfigLoader;
}

export function applyModelConfigEnv(config) {
  const apiKey = config?.apiKey?.trim() || '';
  const baseUrl = config?.baseUrl?.trim() || '';
  const modelName = config?.chatModelName?.trim() || '';
  const modelFamily = config?.chatModelFamily?.trim() || '';
  const reasoningEnabled = 'false';

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
  process.env.MIDSCENE_MODEL_REASONING_ENABLED = reasoningEnabled;
}

export async function applyModelConfigToMidscene(config) {
  applyModelConfigEnv(config);

  const overrideAIConfig = await getOverrideAIConfig();
  overrideAIConfig({
    MIDSCENE_MODEL_API_KEY: config?.apiKey?.trim() || '',
    MIDSCENE_MODEL_BASE_URL: config?.baseUrl?.trim() || '',
    MIDSCENE_MODEL_NAME: config?.chatModelName?.trim() || '',
    MIDSCENE_MODEL_FAMILY: config?.chatModelFamily?.trim() || '',
    MIDSCENE_MODEL_REASONING_ENABLED: 'false',
  });
}
