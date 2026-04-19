import React from 'react';
import { Button, Typography } from 'antd';
import { PanelHeader, SectionBlock } from '../ui';

const { Text } = Typography;

export default function RecommendationsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PanelHeader
        title="推荐巡检"
        description="这里会提供推荐候选人的查看和处理能力。"
      />

      <SectionBlock
        title="即将开放"
        description="相关功能正在准备中。"
      >
        <div className="flex flex-col gap-3">
          <Text size="2" className="leading-7 text-stone-600 dark:text-zinc-400">
            稍后你可以在这里查看推荐候选人、跟进处理进度，并查看结果。
          </Text>
          <Button disabled className="w-fit min-h-10 rounded-full border-stone-200 bg-stone-50 px-4 font-medium text-stone-600 shadow-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            敬请期待
          </Button>
        </div>
      </SectionBlock>
    </div>
  );
}
