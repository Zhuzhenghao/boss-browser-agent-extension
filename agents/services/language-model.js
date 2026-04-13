import { gateway } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export function assertEnv(name) {
  if (!process.env[name]) {
    throw new Error(`缺少环境变量 ${name}`);
  }
}

function resolveFirstEnv(names) {
  for (const name of names) {
    if (process.env[name]) {
      return process.env[name];
    }
  }
  return '';
}

export function createLanguageModel() {
  const compatibleApiKey = resolveFirstEnv(['MIDSCENE_MODEL_API_KEY']);
  const compatibleModelName = resolveFirstEnv(['MIDSCENE_MODEL_NAME']);
  const compatibleBaseUrl = resolveFirstEnv(['MIDSCENE_MODEL_BASE_URL']);

  if (compatibleApiKey && compatibleModelName && compatibleBaseUrl) {
    const provider = createOpenAICompatible({
      name: 'custom-openai-compatible',
      baseURL: compatibleBaseUrl.replace(/\/$/, ''),
      apiKey: compatibleApiKey,
    });

    return provider.chatModel(compatibleModelName);
  }

  const gatewayApiKey = resolveFirstEnv([
    'AI_GATEWAY_API_KEY',
    'VERCEL_AI_GATEWAY_API_KEY',
  ]);
  const gatewayModel = resolveFirstEnv([
    'AI_GATEWAY_MODEL',
    'VERCEL_AI_GATEWAY_MODEL',
    'MIDSCENE_MODEL_NAME',
  ]);

  if (gatewayApiKey && gatewayModel) {
    process.env.AI_GATEWAY_API_KEY = gatewayApiKey;
    return gateway(gatewayModel);
  }

  assertEnv('MIDSCENE_MODEL_API_KEY');
  assertEnv('MIDSCENE_MODEL_NAME');
  assertEnv('MIDSCENE_MODEL_BASE_URL');

  throw new Error('模型配置不可用，请检查 .env 中的 Qwen 或 AI Gateway 配置');
}

export function createTextLanguageModel() {
  const compatibleApiKey = resolveFirstEnv(['MIDSCENE_MODEL_API_KEY']);
  const compatibleBaseUrl = resolveFirstEnv(['MIDSCENE_MODEL_BASE_URL']);
  const textModelName = resolveFirstEnv(['TEXT_MODEL_NAME']) || 'qwen-plus';

  if (compatibleApiKey && compatibleBaseUrl) {
    const provider = createOpenAICompatible({
      name: 'custom-openai-compatible',
      baseURL: compatibleBaseUrl.replace(/\/$/, ''),
      apiKey: compatibleApiKey,
    });

    return provider.chatModel(textModelName);
  }

  const gatewayApiKey = resolveFirstEnv([
    'AI_GATEWAY_API_KEY',
    'VERCEL_AI_GATEWAY_API_KEY',
  ]);
  const gatewayModel = resolveFirstEnv([
    'AI_GATEWAY_MODEL',
    'VERCEL_AI_GATEWAY_MODEL',
  ]);

  if (gatewayApiKey && gatewayModel) {
    process.env.AI_GATEWAY_API_KEY = gatewayApiKey;
    return gateway(gatewayModel);
  }

  return createLanguageModel();
}
