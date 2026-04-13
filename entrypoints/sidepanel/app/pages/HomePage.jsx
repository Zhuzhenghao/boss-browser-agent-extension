import React from 'react';
import { Link } from 'react-router-dom';
import { Card, Col, Row, Tag, Typography } from 'antd';

const { Text, Title } = Typography;

const featureCards = [
  {
    to: '/tasks',
    title: '消息巡检',
    description: '查看任务列表和执行结果',
    badge: '已可用',
    available: true,
  },
  {
    to: '/job-profiles',
    title: 'JD 管理',
    description: '维护多个岗位的招聘标准和禁忌条件',
    badge: '已可用',
    available: true,
  },
  {
    to: '/recommendations',
    title: '推荐巡检',
    description: '推荐候选人处理入口',
    badge: '即将开放',
    available: false,
  },
  {
    to: '/resume-analysis',
    title: '简历分析',
    description: '简历解析与分析',
    badge: '即将开放',
    available: false,
  },
];

export default function HomePage() {
  return (
    <div className='px-3 py-4'>
      <Row gutter={[16, 16]}>
        {featureCards.map((card, index) => {
          const content = (
            <Card
              hoverable={card.available}
              className={`h-full rounded-2xl ${
                card.available ? 'cursor-pointer dark:border-zinc-800 dark:bg-zinc-900' : 'cursor-not-allowed opacity-75 dark:border-zinc-800 dark:bg-zinc-900'
              }`}
              styles={{
                body: {
                  padding: 20,
                  height: '100%',
                },
              }}
            >
              <div className="flex h-full flex-col gap-4">
                <div className="flex items-center justify-between">
                  <Text type="secondary" className="text-xs tracking-[0.14em] dark:text-zinc-500">
                    {String(index + 1).padStart(2, '0')}
                  </Text>

                  <Tag color={card.available ? 'gold' : 'default'} className="m-0 rounded-full">
                    {card.badge}
                  </Tag>
                </div>

                <div className="flex flex-1 flex-col">
                  <Title level={4} className="!mb-2 dark:!text-zinc-100">
                    {card.title}
                  </Title>
                  <Text type="secondary" className="dark:!text-zinc-400">{card.description}</Text>
                </div>
              </div>
            </Card>
          );

          return (
            <Col xs={24} md={8} key={card.to}>
              {card.available ? (
                <Link to={card.to} className="block h-full">
                  {content}
                </Link>
              ) : (
                <div className="h-full">{content}</div>
              )}
            </Col>
          );
        })}
      </Row>
    </div>
  );
}
