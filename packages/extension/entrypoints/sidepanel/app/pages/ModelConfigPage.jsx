import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Input, Select, Space, Typography } from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { fetchModelConfig, saveModelConfig } from '../shared-hooks';

const { Text } = Typography;
const { Password } = Input;

const MODEL_FAMILY_OPTIONS = [
  { value: 'doubao-seed', label: '豆包 Seed (doubao-seed)' },
  { value: 'doubao-vision', label: '豆包 Vision (doubao-vision)' },
  { value: 'qwen3.5', label: '千问 Qwen3.5 (qwen3.5)' },
  { value: 'qwen3.6', label: '千问 Qwen3.6 (qwen3.6)' },
  { value: 'qwen3-vl', label: '千问 Qwen3-VL (qwen3-vl)' },
  { value: 'qwen2.5-vl', label: '千问 Qwen2.5-VL (qwen2.5-vl)' },
  { value: 'glm-v', label: '智谱 GLM-V (glm-v)' },
  { value: 'auto-glm', label: '智谱 AutoGLM 中文 (auto-glm)' },
  { value: 'auto-glm-multilingual', label: '智谱 AutoGLM 多语言 (auto-glm-multilingual)' },
  { value: 'gemini', label: 'Gemini (gemini)' },
  { value: 'gpt-5', label: 'GPT-5 (gpt-5)' },
  { value: 'vlm-ui-tars', label: 'UI-TARS v1.0 (vlm-ui-tars)' },
  { value: 'vlm-ui-tars-doubao-1.5', label: 'UI-TARS Doubao-1.5 (vlm-ui-tars-doubao-1.5)' },
];

export default function ModelConfigPage() {
  const { message } = App.useApp();
  const [config, setConfig] = useState({
    providerType: 'openai-compatible',
    apiKey: '',
    baseUrl: '',
    chatModelName: '',
    chatModelFamily: '',
    textModelName: 'qwen-plus',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchModelConfig();
        if (!cancelled) {
          setConfig({
            providerType: 'openai-compatible',
            apiKey: data.apiKey || '',
            baseUrl: data.baseUrl || '',
            chatModelName: data.chatModelName || '',
            chatModelFamily: data.chatModelFamily || '',
            textModelName: data.textModelName || 'qwen-plus',
          });
        }
      } catch (error) {
        if (!cancelled) {
          message.error(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [message]);

  const handleSave = useCallback(async () => {
    if (!config.apiKey.trim()) {
      message.error('请先填写 API Key');
      return;
    }
    if (!config.baseUrl.trim()) {
      message.error('请先填写 Base URL');
      return;
    }
    if (!config.chatModelName.trim()) {
      message.error('请先填写对话模型名称');
      return;
    }
    if (!config.chatModelFamily.trim()) {
      message.error('请先选择模型家族');
      return;
    }
    setSaving(true);
    try {
      await saveModelConfig({
        ...config,
        providerType: 'openai-compatible',
      });
      message.success('模型配置已保存');
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [config, message]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <Space size={14}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => window.history.back()}
            size="small"
          />
          <div className="flex flex-col">
            <Text className="text-[14px] font-bold text-zinc-800 dark:text-zinc-100">
              模型配置
            </Text>
          </div>
        </Space>
      </div>

      <div className="flex-1 p-4">
        <Card
          loading={loading}
          className="mb-4"
          styles={{ body: { padding: 16 } }}
        >
          <div className="flex flex-col gap-4">
            <div>
              <Text className="text-[13px] font-medium text-stone-800 dark:text-zinc-200">
                提供商类型
              </Text>
              <Input className="mt-1" value="OpenAI 兼容接口" size="middle" disabled />
            </div>

            <div>
              <Text className="text-[13px] font-medium text-stone-800 dark:text-zinc-200">
                API Key
              </Text>
              <Password
                className="mt-1 w-full"
                value={config.apiKey}
                onChange={(e) => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder="sk-..."
                size="middle"
                allowClear
              />
            </div>

            <div>
              <Text className="text-[13px] font-medium text-stone-800 dark:text-zinc-200">
                Base URL
              </Text>
              <Input
                className="mt-1"
                value={config.baseUrl}
                onChange={(e) => setConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                placeholder="https://api.openai.com/v1"
                size="middle"
                allowClear
              />
            </div>

            <div>
              <Text className="text-[13px] font-medium text-stone-800 dark:text-zinc-200">
                对话模型名称
              </Text>
              <Input
                className="mt-1"
                value={config.chatModelName}
                onChange={(e) => setConfig(prev => ({ ...prev, chatModelName: e.target.value }))}
                placeholder="gpt-4o, qwen-plus, doubao-seed-2.0-vision"
                size="middle"
                allowClear
              />
            </div>

            <div>
              <Text className="text-[13px] font-medium text-stone-800 dark:text-zinc-200">
                模型家族（必填）
              </Text>
              <Select
                className="mt-1 w-full"
                value={config.chatModelFamily}
                onChange={(value) => setConfig(prev => ({ ...prev, chatModelFamily: value }))}
                options={MODEL_FAMILY_OPTIONS}
                size="middle"
                placeholder="选择模型家族"
              />
            </div>

            <div>
              <Text className="text-[13px] font-medium text-stone-800 dark:text-zinc-200">
                文本模型名称（用于 JD 解析等轻量任务）
              </Text>
              <Input
                className="mt-1"
                value={config.textModelName}
                onChange={(e) => setConfig(prev => ({ ...prev, textModelName: e.target.value }))}
                placeholder="qwen-plus"
                size="middle"
                allowClear
              />
            </div>
          </div>
        </Card>

        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={saving}
          onClick={handleSave}
          block
        >
          保存配置
        </Button>
      </div>
    </div>
  );
}
