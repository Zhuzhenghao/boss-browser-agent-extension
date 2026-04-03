import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export function assertEnv(name) {
  if (!process.env[name]) {
    throw new Error(`缺少环境变量 ${name}`);
  }
}

export function createLanguageModel() {
  assertEnv('MIDSCENE_MODEL_API_KEY');
  assertEnv('MIDSCENE_MODEL_NAME');
  assertEnv('MIDSCENE_MODEL_BASE_URL');

  const provider = createOpenAICompatible({
    name: 'custom-openai-compatible',
    baseURL: process.env.MIDSCENE_MODEL_BASE_URL.replace(/\/$/, ''),
    apiKey: process.env.MIDSCENE_MODEL_API_KEY,
  });

  return provider.chatModel(process.env.MIDSCENE_MODEL_NAME);
}
