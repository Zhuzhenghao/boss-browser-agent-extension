import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { getModelConfig } from '../../server/model-config-store.js';

function resolveFirstEnv(names) {
  for (const name of names) {
    if (process.env[name]) {
      return process.env[name];
    }
  }
  return '';
}

function resolveFirst(values) {
  for (const value of values) {
    if (value) {
      return value;
    }
  }
  return '';
}

export function createLanguageModel() {
  const config = getModelConfig();

  const apiKey = resolveFirst([config.apiKey, resolveFirstEnv(['MIDSCENE_MODEL_API_KEY'])]);
  const baseUrl = resolveFirst([config.baseUrl, resolveFirstEnv(['MIDSCENE_MODEL_BASE_URL'])]);
  const chatModelName = resolveFirst([config.chatModelName, resolveFirstEnv(['MIDSCENE_MODEL_NAME'])]);
  const chatModelFamily = resolveFirst([config.chatModelFamily, resolveFirstEnv(['MIDSCENE_MODEL_FAMILY'])]);

  if (!apiKey || !baseUrl || !chatModelName || !chatModelFamily) {
    throw new Error('模型未配置完成，请前往设置 > 模型配置，填写 API Key、Base URL、对话模型名称和模型家族');
  }

  process.env.MIDSCENE_MODEL_FAMILY = chatModelFamily;

  const provider = createOpenAICompatible({
    name: 'custom-openai-compatible',
    baseURL: baseUrl.replace(/\/$/, ''),
    apiKey,
  });
  return provider.chatModel(chatModelName);
}

export function createTextLanguageModel() {
  const config = getModelConfig();

  const apiKey = resolveFirst([config.apiKey, resolveFirstEnv(['MIDSCENE_MODEL_API_KEY'])]);
  const baseUrl = resolveFirst([config.baseUrl, resolveFirstEnv(['MIDSCENE_MODEL_BASE_URL'])]);
  const textModelName = resolveFirst([config.textModelName, resolveFirstEnv(['TEXT_MODEL_NAME']), 'qwen-plus']);

  if (apiKey && baseUrl) {
    const provider = createOpenAICompatible({
      name: 'custom-openai-compatible',
      baseURL: baseUrl.replace(/\/$/, ''),
      apiKey,
    });
    return provider.chatModel(textModelName);
  }

  return createLanguageModel();
}
