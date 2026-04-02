const targetProfileEl = document.getElementById('targetProfile');
const rejectionMessageEl = document.getElementById('rejectionMessage');
const runButton = document.getElementById('runButton');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');

const BRIDGE_ENDPOINT = 'http://127.0.0.1:3322/api/screen-unread';
const BRIDGE_STATE_ENDPOINT = 'http://127.0.0.1:3322/api/screen-unread/state';
let statePollingTimer = null;

function setStatus(message) {
  statusEl.textContent = message;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function prettyJson(value) {
  return escapeHtml(JSON.stringify(value, null, 2));
}

function renderStepCards(steps) {
  return steps
    .map((step) => {
      const toolCalls = Array.isArray(step.toolCalls) ? step.toolCalls : [];
      const toolResults = Array.isArray(step.toolResults) ? step.toolResults : [];

      const callHtml = toolCalls.length
        ? toolCalls
            .map(
              (call, index) => `
                <div class="tool-card">
                  <div class="tool-title">调用 ${index + 1}: ${escapeHtml(call.toolName || 'unknown-tool')}</div>
                  <pre class="tool-json">${prettyJson(call.input ?? {})}</pre>
                </div>
              `,
            )
            .join('')
        : '<div class="empty-tip">这一轮没有触发 tool 调用</div>';

      const resultHtml = toolResults.length
        ? toolResults
            .map(
              (result, index) => `
                <div class="tool-card">
                  <div class="tool-title">返回 ${index + 1}: ${escapeHtml(result.toolName || 'unknown-tool')}</div>
                  <pre class="tool-json">${prettyJson(result.output ?? {})}</pre>
                </div>
              `,
            )
            .join('')
        : '<div class="empty-tip">这一轮没有 tool 返回值</div>';

      return `
        <section class="step-card">
          <div class="step-head">
            <div>
              <div class="step-index">Step ${escapeHtml(step.stepNumber || '')}</div>
              <div class="step-finish">${escapeHtml(step.finishReason || 'in-progress')}</div>
            </div>
          </div>
          <div class="step-text">${escapeHtml(step.text || '无文本输出')}</div>
          <div class="tool-group">
            <div class="group-title">Tool Calls</div>
            ${callHtml}
          </div>
          <div class="tool-group">
            <div class="group-title">Tool Results</div>
            ${resultHtml}
          </div>
        </section>
      `;
    })
    .join('');
}

function renderResult(result) {
  if (!result) {
    resultEl.hidden = true;
    resultEl.innerHTML = '';
    return;
  }

  const message = result.summary || result.finalizeMessage || result.rawResponse || '执行完成，但没有返回可展示内容';
  const logs = Array.isArray(result.operationLog) ? result.operationLog : [];
  const steps = Array.isArray(result.steps) ? result.steps : [];
  const errorHtml = result.error
    ? `<div class="result-section"><div class="result-label">错误</div><div class="result-message">${escapeHtml(result.error)}</div></div>`
    : '';

  resultEl.hidden = false;
  resultEl.innerHTML = `
    <div class="result-section">
      <div class="result-label">执行总结</div>
      <div class="result-message">${escapeHtml(message)}</div>
    </div>
    ${errorHtml}
    ${logs.length ? `<div class="result-section"><div class="result-label">执行日志</div><pre class="result-json">${escapeHtml(logs.join('\n'))}</pre></div>` : ''}
    ${steps.length ? `<div class="result-section"><div class="result-label">Agent Steps</div><div class="steps-grid">${renderStepCards(steps)}</div></div>` : ''}
    <div class="result-section">
      <div class="result-label">完整结果</div>
      <pre class="result-json">${prettyJson(result)}</pre>
    </div>
  `;
}

async function pollRunState() {
  const response = await fetch(BRIDGE_STATE_ENDPOINT);
  const result = await response.json();
  if (!response.ok || !result.ok) {
    return;
  }

  const state = result.data || {};
  if (state.status === 'running') {
    setStatus('Agent 执行中，正在持续刷新步骤和工具调用...');
    renderResult(state);
    return;
  }

  if (state.status === 'completed') {
    setStatus('执行完成');
    renderResult(state);
    stopStatePolling();
    return;
  }

  if (state.status === 'error') {
    setStatus(state.error || '执行失败');
    renderResult(state);
    stopStatePolling();
  }
}

function startStatePolling() {
  stopStatePolling();
  statePollingTimer = setInterval(() => {
    pollRunState().catch(() => {});
  }, 1200);
}

function stopStatePolling() {
  if (statePollingTimer) {
    clearInterval(statePollingTimer);
    statePollingTimer = null;
  }
}

runButton.addEventListener('click', async () => {
  const targetProfile = targetProfileEl.value.trim();
  const rejectionMessage = rejectionMessageEl.value.trim();

  if (!targetProfile) {
    setStatus('请先填写目标候选人的特征');
    renderResult(null);
    return;
  }

  runButton.disabled = true;
  setStatus('正在执行未读消息筛选 Agent。它会打开沟通页、提取未读名单、查看简历、判断匹配，并执行置顶或发送消息。');
  renderResult(null);
  startStatePolling();

  try {
    const response = await fetch(BRIDGE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetProfile, rejectionMessage }),
    });

    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || '执行失败');
    }

    setStatus('执行完成');
    renderResult(result.data);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
    renderResult(null);
    stopStatePolling();
  } finally {
    runButton.disabled = false;
  }
});
