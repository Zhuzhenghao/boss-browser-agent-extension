// 共享的 API 端点
export const BRIDGE_START_ENDPOINT = 'http://127.0.0.1:3322/api/screen-unread/start';
export const BRIDGE_SUBSCRIBE_ENDPOINT = 'http://127.0.0.1:3322/api/screen-unread/subscribe';
export const BRIDGE_STOP_ENDPOINT = 'http://127.0.0.1:3322/api/screen-unread/stop';
export const BRIDGE_STATUS_ENDPOINT = 'http://127.0.0.1:3322/api/bridge-status';
export const SCREENING_TASKS_ENDPOINT = 'http://127.0.0.1:3322/api/screening-tasks';
export const JOB_PROFILES_ENDPOINT = 'http://127.0.0.1:3322/api/job-profiles';
export const JOB_PROFILES_IMPORT_ENDPOINT = 'http://127.0.0.1:3322/api/job-profiles/import';
export const MODEL_CONFIG_ENDPOINT = 'http://127.0.0.1:3322/api/model-config';

export const DEFAULT_REJECTION_MESSAGE = '您的简历很优秀，但是经验不匹配';

// 工具函数
export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function flattenCandidateToolTimeline(task) {
  const candidates = Array.isArray(task?.candidates) ? task.candidates : [];
  return candidates.flatMap(candidate => (
    Array.isArray(candidate?.toolTimeline) ? candidate.toolTimeline : []
  ));
}

export function resolveToolTimeline(task, toolEvents) {
  if (Array.isArray(toolEvents) && toolEvents.length) {
    return toolEvents;
  }
  return flattenCandidateToolTimeline(task);
}

// 检查 Bridge 状态
export async function waitForBridgeReady(setStatusFn) {
  const attempts = 5;
  for (let index = 0; index < attempts; index += 1) {
    setStatusFn(`正在检查 Bridge 连接状态（${index + 1}/${attempts}）...`);
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

// 启动任务
export async function startTask({ targetProfile, rejectionMessage, jobTitle = '', jobProfileId = null, testCandidateNames, taskId = '', mode = 'start', setStatusFn }) {
  setStatusFn('正在启动任务...');

  const response = await fetch(BRIDGE_START_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      targetProfile,
      rejectionMessage,
      jobTitle,
      jobProfileId,
      testCandidateNames,
      taskId,
      mode,
    }),
  });

  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || '启动任务失败');
  }

  setStatusFn('任务已启动');
  return payload.taskId;
}

// 停止任务
export async function stopTask() {
  await fetch(BRIDGE_STOP_ENDPOINT, {
    method: 'POST',
  });
}

// 获取任务列表
export async function fetchTaskList(taskFilter = 'all', jobProfileId = null) {
  const params = new URLSearchParams();
  
  if (taskFilter && taskFilter !== 'all') {
    params.append('status', taskFilter);
  }
  
  if (jobProfileId) {
    params.append('jobProfileId', jobProfileId);
  }
  
  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${SCREENING_TASKS_ENDPOINT}${query}`);
  const payload = await response.json();
  if (response.ok && payload.ok && Array.isArray(payload.data)) {
    return payload.data;
  }
  return [];
}

// 获取任务详情
export async function fetchTaskDetail(taskId) {
  const response = await fetch(`${SCREENING_TASKS_ENDPOINT}/${encodeURIComponent(taskId)}`);
  const payload = await response.json();
  if (response.ok && payload.ok && payload.data?.task) {
    return {
      task: payload.data.task,
      toolEvents: payload.data.toolEvents || [],
    };
  }
  return null;
}

// 删除任务
export async function deleteTask(taskId) {
  const response = await fetch(`${SCREENING_TASKS_ENDPOINT}/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || '删除任务失败');
  }
}

export async function fetchJobProfiles() {
  const response = await fetch(JOB_PROFILES_ENDPOINT);
  const payload = await response.json();
  if (response.ok && payload.ok && Array.isArray(payload.data)) {
    return payload.data;
  }
  throw new Error(payload?.error || '读取岗位 JD 失败');
}

export async function fetchJobProfile(profileId) {
  const response = await fetch(`${JOB_PROFILES_ENDPOINT}/${encodeURIComponent(profileId)}`);
  const payload = await response.json();
  if (response.ok && payload.ok && payload.data) {
    return payload.data;
  }
  throw new Error(payload?.error || '读取岗位 JD 详情失败');
}

export async function createJobProfile(profile) {
  const response = await fetch(JOB_PROFILES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ profile }),
  });
  const payload = await response.json();
  if (response.ok && payload.ok && payload.data) {
    return payload.data;
  }
  throw new Error(payload?.error || '创建岗位 JD 失败');
}

export async function updateJobProfile(profileId, profile) {
  const response = await fetch(`${JOB_PROFILES_ENDPOINT}/${encodeURIComponent(profileId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ profile }),
  });
  const payload = await response.json();
  if (response.ok && payload.ok && payload.data) {
    return payload.data;
  }
  throw new Error(payload?.error || '保存岗位 JD 失败');
}

export async function deleteJobProfile(profileId) {
  const response = await fetch(`${JOB_PROFILES_ENDPOINT}/${encodeURIComponent(profileId)}`, {
    method: 'DELETE',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || '删除岗位 JD 失败');
  }
}

export async function importJobProfile(files, existingProfile) {
  const formData = new FormData();
  Array.from(files || []).forEach(file => {
    formData.append('files', file);
  });
  formData.append('existingProfile', JSON.stringify(existingProfile || {}));

  const response = await fetch(JOB_PROFILES_IMPORT_ENDPOINT, {
    method: 'POST',
    body: formData,
  });
  const payload = await response.json().catch(() => null);
  if (response.status === 404) {
    throw new Error('当前本地 bridge 服务还没有加载岗位导入接口，请重启 `npm run bridge-demo` 后再试。');
  }
  if (response.ok && payload.ok && payload.data) {
    return payload.data;
  }
  throw new Error(payload?.error || '导入岗位资料失败');
}

export async function fetchModelConfig() {
  const response = await fetch(MODEL_CONFIG_ENDPOINT);
  const payload = await response.json();
  if (response.ok && payload.ok && payload.data) {
    return payload.data;
  }
  throw new Error(payload?.error || '读取模型配置失败');
}

export async function saveModelConfig(config) {
  const response = await fetch(MODEL_CONFIG_ENDPOINT, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ config }),
  });
  const payload = await response.json();
  if (response.ok && payload.ok && payload.data) {
    return payload.data;
  }
  throw new Error(payload?.error || '保存模型配置失败');
}
