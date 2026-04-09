import React from 'react';
import { Button, Typography } from 'antd';
import { PanelHeader, SectionBlock } from '../ui';

const { Text } = Typography;

export default function ResumeAnalysisPage() {
  return (
    <div className="flex flex-col gap-4">
      <PanelHeader
        title="简历分析"
        description="这里会提供简历解析和分析能力。"
      />

      <SectionBlock
        title="即将开放"
        description="相关功能正在准备中。"
      >
        <div className="flex flex-col gap-3">
          <Text size="2" className="leading-7 text-stone-600">
            稍后你可以在这里查看简历摘要、能力亮点和匹配判断。
          </Text>
          <Button disabled className="w-fit min-h-10 rounded-full border-stone-200 bg-stone-50 px-4 font-medium text-stone-600 shadow-none">
            敬请期待
          </Button>
        </div>
      </SectionBlock>
    </div>
  );
}
