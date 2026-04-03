import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Text,
  TextArea,
  Theme,
} from '@radix-ui/themes';
import './style.css';

const BRIDGE_ENDPOINT = 'http://127.0.0.1:3322/api/screen-unread';
const BRIDGE_STATE_ENDPOINT = 'http://127.0.0.1:3322/api/screen-unread/state';
const BRIDGE_STATUS_ENDPOINT = 'http://127.0.0.1:3322/api/bridge-status';
const DEFAULT_REJECTION_MESSAGE = '您的简历很优秀，但是经验不匹配';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function PanelHeader({ eyebrow, title, description, badge }) {
  return (
    <Flex direction="column" gap="1">
      <Flex align="center" gap="2" wrap="wrap">
        <Text size="1" weight="medium" className="uppercase tracking-[0.18em] text-stone-400">
          {eyebrow}
        </Text>
        {badge ? <Badge color="gray" variant="soft" radius="full">{badge}</Badge> : null}
      </Flex>
      <Heading size="7" className="text-stone-950">
        {title}
      </Heading>
      <Text size="2" className="max-w-3xl text-stone-500">
        {description}
      </Text>
    </Flex>
  );
}

function JsonBlock({ value }) {
  return (
    <Box className="overflow-auto rounded-xl border border-stone-200 bg-white p-3">
      <pre className="whitespace-pre-wrap break-words text-[12px] leading-6 text-stone-700">
        {prettyJson(value)}
      </pre>
    </Box>
  );
}

function SectionBlock({ label, children }) {
  return (
    <Flex direction="column" gap="2">
      <Text size="1" weight="medium" className="uppercase tracking-[0.16em] text-stone-400">
        {label}
      </Text>
      {children}
    </Flex>
  );
}

function DetailSection({ label, children, defaultOpen = false }) {
  return (
    <details
      open={defaultOpen}
      className="rounded-xl border border-stone-200 bg-white/70 open:bg-white"
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-stone-700">
        {label}
      </summary>
      <div className="border-t border-stone-200 px-4 py-4">{children}</div>
    </details>
  );
}

function ResultView({ result }) {
  if (!result) {
    return null;
  }

  const message =
    result.summary ||
    result.finalizeMessage ||
    result.rawResponse ||
    '执行完成，但没有返回可展示内容';
  const logs = Array.isArray(result.operationLog) ? result.operationLog : [];
  const steps = Array.isArray(result.steps) ? result.steps : [];
  const noteFiles = Array.isArray(result.noteFiles) ? result.noteFiles : [];

  return (
    <Card size="2" className="border border-stone-200 bg-white shadow-none">
      <Flex direction="column" gap="4">
        <SectionBlock label="执行总结">
          <Box className="rounded-xl bg-stone-50/70 p-4 text-sm leading-7 text-stone-700">
            {message}
          </Box>
        </SectionBlock>

        {result.error ? (
          <SectionBlock label="错误">
            <Box className="rounded-xl bg-red-50 p-4 text-sm leading-7 text-red-700">
              {result.error}
            </Box>
          </SectionBlock>
        ) : null}

        <Flex direction="column" gap="3">
          {noteFiles.length ? (
            <DetailSection label="Markdown 文件">
              <JsonBlock value={noteFiles} />
            </DetailSection>
          ) : null}

          {logs.length ? (
            <DetailSection label="执行日志">
              <Box className="rounded-xl bg-stone-50/70 p-4">
                <pre className="whitespace-pre-wrap break-words text-[12px] leading-6 text-stone-700">
                  {logs.join('\n')}
                </pre>
              </Box>
            </DetailSection>
          ) : null}

          {steps.length ? (
            <DetailSection label="Agent Steps">
              <Flex direction="column" gap="3">
                {steps.map((step) => {
                  const toolCalls = Array.isArray(step.toolCalls) ? step.toolCalls : [];
                  const toolResults = Array.isArray(step.toolResults) ? step.toolResults : [];

                  return (
                    <Card key={`step-${step.stepNumber}`} size="1" className="border border-stone-200 bg-white shadow-none">
                      <Flex direction="column" gap="3">
                        <Flex align="center" justify="between" gap="3" wrap="wrap">
                          <Flex direction="column" gap="1">
                            <Text size="1" weight="medium" className="uppercase tracking-[0.16em] text-stone-400">
                              Step {step.stepNumber}
                            </Text>
                            <Text size="2" className="text-stone-600">
                              {step.finishReason || 'in-progress'}
                            </Text>
                          </Flex>
                          <Badge color="gray" variant="soft" radius="full">
                            {toolCalls.length} calls / {toolResults.length} results
                          </Badge>
                        </Flex>

                        <Box className="rounded-lg bg-stone-50 p-4 text-sm leading-7 text-stone-700">
                          {step.text || '无文本输出'}
                        </Box>

                        <Flex direction="column" gap="2">
                          <Text size="2" weight="medium" className="text-stone-800">
                            Tool Calls
                          </Text>
                          {toolCalls.length ? (
                            toolCalls.map((call, index) => (
                              <Card key={`call-${step.stepNumber}-${index}`} size="1" className="border border-stone-200/80 shadow-none">
                                <Flex direction="column" gap="2">
                                  <Text size="2" weight="medium" className="text-stone-800">
                                    调用 {index + 1}: {call.toolName || 'unknown-tool'}
                                  </Text>
                                  <JsonBlock value={call.input ?? {}} />
                                </Flex>
                              </Card>
                            ))
                          ) : (
                            <Text size="2" className="text-stone-500">
                              这一轮没有触发 tool 调用
                            </Text>
                          )}
                        </Flex>

                        <Flex direction="column" gap="2">
                          <Text size="2" weight="medium" className="text-stone-800">
                            Tool Results
                          </Text>
                          {toolResults.length ? (
                            toolResults.map((toolResult, index) => (
                              <Card key={`result-${step.stepNumber}-${index}`} size="1" className="border border-stone-200/80 shadow-none">
                                <Flex direction="column" gap="2">
                                  <Text size="2" weight="medium" className="text-stone-800">
                                    返回 {index + 1}: {toolResult.toolName || 'unknown-tool'}
                                  </Text>
                                  <JsonBlock value={toolResult.output ?? {}} />
                                </Flex>
                              </Card>
                            ))
                          ) : (
                            <Text size="2" className="text-stone-500">
                              这一轮没有 tool 返回值
                            </Text>
                          )}
                        </Flex>
                      </Flex>
                    </Card>
                  );
                })}
              </Flex>
            </DetailSection>
          ) : null}

          <DetailSection label="完整结果">
            <JsonBlock value={result} />
          </DetailSection>
        </Flex>
      </Flex>
    </Card>
  );
}

function UnreadScreeningPage() {
  const [targetProfile, setTargetProfile] = useState('');
  const [rejectionMessage, setRejectionMessage] = useState(DEFAULT_REJECTION_MESSAGE);
  const [status, setStatus] = useState('等待执行');
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) {
      return undefined;
    }

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(BRIDGE_STATE_ENDPOINT);
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          return;
        }

        const state = payload.data || {};
        if (state.status === 'running') {
          setStatus('Agent 执行中，正在持续刷新步骤和工具调用...');
          setResult(state);
          return;
        }

        if (state.status === 'completed') {
          setStatus('执行完成');
          setResult(state);
          setRunning(false);
          return;
        }

        if (state.status === 'error') {
          setStatus(state.error || '执行失败');
          setResult(state);
          setRunning(false);
        }
      } catch {
        return;
      }
    }, 1200);

    return () => window.clearInterval(timer);
  }, [running]);

  async function waitForBridgeReady() {
    const attempts = 5;
    for (let index = 0; index < attempts; index += 1) {
      setStatus(`正在检查 Bridge 连接状态（${index + 1}/${attempts}）...`);
      const response = await fetch(BRIDGE_STATUS_ENDPOINT);
      const payload = await response.json();

      if (response.ok && payload.ok && payload.data?.ok) {
        return;
      }

      if (index < attempts - 1) {
        await wait(1200);
      } else {
        throw new Error(payload?.data?.message || payload?.error || 'Bridge 尚未连接到当前 tab');
      }
    }
  }

  async function handleRun() {
    if (!targetProfile.trim()) {
      setStatus('请先填写目标候选人的特征');
      setResult(null);
      return;
    }

    setRunning(true);
    setResult(null);
    setStatus('准备执行未读消息筛选 Agent，先确认 Boss 页面和 Bridge 已就绪。');

    try {
      await waitForBridgeReady();
      setStatus('Bridge 已就绪，开始执行未读消息筛选 Agent。');

      const response = await fetch(BRIDGE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetProfile: targetProfile.trim(),
          rejectionMessage: rejectionMessage.trim(),
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || '执行失败');
      }

      setStatus('执行完成');
      setResult(payload.data);
      setRunning(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setResult(null);
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card size="2" className="border border-stone-200 bg-white shadow-none">
        <Flex direction="column" gap="4">
          <PanelHeader
            eyebrow="Workflow"
            title="未读消息筛选 Agent"
            description="先确保 Midscene Chrome 扩展已进入 Bridge Mode Listening，并把目标标签页切到前台。"
            badge="Active"
          />

          <Flex direction="column" gap="2">
            <Text size="2" weight="medium" className="text-stone-800">
              目标候选人特征
            </Text>
            <TextArea
              size="3"
              value={targetProfile}
              onChange={(event) => setTargetProfile(event.target.value)}
              placeholder="例如：AI 项目经理，5 年以上 ToB 项目交付经验，熟悉大模型/数据产品，有零售或企业数字化背景，能推动跨团队协作。"
              className="min-h-36"
            />
          </Flex>

          <Flex direction="column" gap="2">
            <Text size="2" weight="medium" className="text-stone-800">
              不匹配回复语
            </Text>
            <TextArea
              size="2"
              value={rejectionMessage}
              onChange={(event) => setRejectionMessage(event.target.value)}
              placeholder={DEFAULT_REJECTION_MESSAGE}
              className="min-h-24"
            />
          </Flex>

          <Flex align="center" gap="3" wrap="wrap">
            <Button size="3" color="gray" highContrast onClick={handleRun} disabled={running}>
              {running ? '执行中...' : '开始执行'}
            </Button>
            <Badge color="gray" variant="soft" size="2" radius="full">
              {running ? '运行中' : '空闲'}
            </Badge>
          </Flex>

          <Card size="1" className="border border-stone-200 bg-stone-50/70 shadow-none">
            <Text size="2" className="whitespace-pre-wrap leading-7 text-stone-700">
              {status}
            </Text>
          </Card>
        </Flex>
      </Card>

      <ResultView result={result} />
    </div>
  );
}

function Layout() {
  return (
    <main className="min-h-screen bg-transparent p-4">
      <Flex direction="column" gap="3">
        <Card className="border border-stone-200 bg-white shadow-none">
          <Flex align="center" justify="between" gap="4" wrap="wrap">
            <Flex align="center" gap="4" wrap="wrap">
              <Heading size="3" className="text-stone-950">
                Boss Browser Agent
              </Heading>
              <Badge color="orange" variant="soft" radius="full">
                未读消息筛选
              </Badge>
            </Flex>

            <Text size="1" className="text-stone-400">Sidepanel</Text>
          </Flex>
        </Card>

        <UnreadScreeningPage />
      </Flex>
    </main>
  );
}

function App() {
  return (
    <Theme appearance="light" accentColor="orange" grayColor="sand" radius="large" scaling="100%">
      <Layout />
    </Theme>
  );
}

createRoot(document.getElementById('root')).render(<App />);
