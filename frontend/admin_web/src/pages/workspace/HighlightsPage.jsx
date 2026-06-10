import { useMemo, useState } from 'react';
import { Button, Checkbox, DatePicker, Modal, Pagination, Radio, Table, Tag, message } from 'antd';
import {
  CalendarOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  ReloadOutlined,
  SettingOutlined,
  WarningOutlined,
} from '@ant-design/icons';

const publishItems = [
  { id: 'pub-ready-1', title: '她的逆袭人生 - 第 1 集', updated_at: '今天 14:30', publish_status: 'publishing' },
  { id: 'pub-ready-2', title: '绿起长安 - 第 2 集', updated_at: '今天 13:20', publish_status: 'unpublished' },
  { id: 'pub-ready-3', title: '闪婚总裁太会宠 - 第 3 集', updated_at: '昨天 20:18', publish_status: 'failed' },
  { id: 'pub-ready-4', title: '重生之商界女王 - 第 1 集', updated_at: '昨天 18:45', publish_status: 'unpublished' },
];

const recentRecords = [
  { id: 'PUB-20240517-104', content: '心动24小时 第2集', channel: 'Android 播放端', result: '已上线', flow: '回流正常', resultTone: 'success', flowTone: 'success' },
  { id: 'PUB-20240517-098', content: '暗夜心跳 第7集', channel: 'Android 播放端', result: '已上线', flow: '回流延迟', resultTone: 'success', flowTone: 'warning' },
  { id: 'PUB-20240516-076', content: '千金归来计划 第5集', channel: 'Android 播放端', result: '发布失败', flow: '需重试', resultTone: 'error', flowTone: 'error' },
  { id: 'PUB-20240516-052', content: '她的逆袭人生 第0集预告', channel: 'Android 播放端', result: '已上线', flow: '数据良好', resultTone: 'success', flowTone: 'blue' },
];

const publishMetrics = [
  { label: '待发布', value: 14, hint: '待完成最终检查', icon: <CalendarOutlined />, tone: 'blue' },
  { label: '发布中', value: 3, hint: '渠道同步进行中', icon: <CloudUploadOutlined />, tone: 'purple' },
  { label: '已发布', value: 48, hint: '本周新增 +12', icon: <CheckCircleOutlined />, tone: 'green' },
  { label: '异常回流', value: 2, hint: '需要人工处理', icon: <WarningOutlined />, tone: 'red' },
];

const publishStatusMeta = {
  publishing: { label: '发布中', color: 'processing' },
  unpublished: { label: '未发布', color: 'default' },
  failed: { label: '失败', color: 'error' },
};

export default function HighlightsPage() {
  const [selectedRowKeys, setSelectedRowKeys] = useState([publishItems[0].id]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [configOpen, setConfigOpen] = useState(false);
  const [configItem, setConfigItem] = useState(publishItems[0]);
  const pageSize = 6;
  const filteredItems = useMemo(
    () => publishItems.filter((item) => statusFilter === 'all' || item.publish_status === statusFilter),
    [statusFilter],
  );
  const effectivePage = Math.min(currentPage, Math.max(1, Math.ceil(filteredItems.length / pageSize)));
  const pagedItems = useMemo(
    () => filteredItems.slice((effectivePage - 1) * pageSize, effectivePage * pageSize),
    [effectivePage, filteredItems],
  );
  const selectedItems = useMemo(
    () => publishItems.filter((item) => selectedRowKeys.includes(item.id)),
    [selectedRowKeys],
  );
  const activeItem = configItem ?? selectedItems[0] ?? publishItems[0];

  const openConfig = (item) => {
    setConfigItem(item);
    setConfigOpen(true);
  };

  const pendingColumns = [
    {
      title: '内容名称',
      dataIndex: 'title',
      width: '42%',
      render: (value) => <strong className="publish-content-name">{value}</strong>,
    },
    {
      title: '状态',
      dataIndex: 'publish_status',
      width: '12%',
      render: (value) => {
        const meta = publishStatusMeta[value] ?? publishStatusMeta.unpublished;
        return (
          <Tag className="analysis-stage-tag" color={meta.color}>
            {meta.label}
          </Tag>
        );
      },
    },
    {
      title: '最后更新时间',
      dataIndex: 'updated_at',
      width: '18%',
    },
    {
      title: '操作',
      key: 'actions',
      width: '28%',
      align: 'right',
      className: 'analysis-action-column',
      render: (_, record) => (
        <div className="analysis-row-actions publish-row-actions">
          <Button icon={<SettingOutlined />} onClick={() => openConfig(record)}>
            修改配置
          </Button>
          <Button type="primary" onClick={() => message.success(`${record.title} 发布任务已提交`)}>
            发布
          </Button>
        </div>
      ),
    },
  ];

  const recordColumns = [
    { title: '发布单号', dataIndex: 'id', width: 170 },
    { title: '内容', dataIndex: 'content' },
    { title: '渠道', dataIndex: 'channel', width: 150 },
    {
      title: '上线结果',
      dataIndex: 'result',
      width: 120,
      render: (value, record) => <Tag className={`publish-record-tag ${record.resultTone}`}>{value}</Tag>,
    },
    {
      title: '数据回流',
      dataIndex: 'flow',
      width: 120,
      render: (value, record) => <Tag className={`publish-record-tag ${record.flowTone}`}>{value}</Tag>,
    },
  ];

  return (
    <section className="publish-center-page">
      <div className="content-page-header">
        <div className="content-page-title">
          <h1>发布中心</h1>
          <p>管理发布编排、渠道配置、定时发布与上线状态，衔接 AI 分析结果与数据回流</p>
        </div>
      </div>

      <div className="publish-metrics">
        {publishMetrics.map((metric) => (
          <article className={`analysis-metric-card ${metric.tone}`} key={metric.label}>
            <span>{metric.icon}</span>
            <div>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <em>{metric.hint}</em>
            </div>
          </article>
        ))}
      </div>

      <section className="analysis-table-panel publish-pending-panel">
        <div className="analysis-filterbar">
          <Radio.Group
            className="analysis-status-tabs"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setCurrentPage(1);
            }}
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: '全部', value: 'all' },
              { label: '发布中', value: 'publishing' },
              { label: '未发布', value: 'unpublished' },
              { label: '失败', value: 'failed' },
            ]}
          />
          <div className="analysis-filter-actions">
            <Button icon={<ReloadOutlined />} onClick={() => message.success('待发布内容已刷新')} />
            <Button type="primary" className="publish-one-click-action" onClick={() => message.success('已提交一键发布任务')}>
              一键发布
            </Button>
          </div>
        </div>
        <Table
          rowKey="id"
          className="analysis-queue-table publish-content-table"
          style={{ width: '100%', minWidth: '100%' }}
          tableLayout="fixed"
          columns={pendingColumns}
          dataSource={pagedItems}
          pagination={false}
          scroll={{ y: 320 }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
        />
        <div className="analysis-list-pagination">
          <span>共 {filteredItems.length} 条内容，已选择 {selectedRowKeys.length} 条</span>
          <Pagination
            current={effectivePage}
            pageSize={pageSize}
            total={filteredItems.length}
            showSizeChanger={false}
            onChange={setCurrentPage}
          />
        </div>
      </section>

      <section className="publish-panel publish-record-panel">
        <div className="publish-record-header">
          <h2>最近发布记录与回流</h2>
          <Button type="link">查看全部发布记录</Button>
        </div>
        <Table rowKey="id" className="publish-record-table" columns={recordColumns} dataSource={recentRecords} pagination={false} />
      </section>

      <Modal
        className="publish-config-modal"
        title="发布配置"
        open={configOpen}
        onCancel={() => setConfigOpen(false)}
        footer={null}
        width={640}
        destroyOnHidden
      >
        <div className="publish-config-grid">
          <span>标题</span>
          <strong>{activeItem.title}</strong>

          <span>发布渠道</span>
          <Checkbox.Group
            className="publish-check-group"
            defaultValue={['android']}
            options={[
              { label: 'Android 播放端', value: 'android' },
            ]}
          />

          <span>发布时间</span>
          <DatePicker className="publish-config-input" showTime format="YYYY-MM-DD HH:mm" placeholder="选择发布时间" />

          <span>互动策略挂载</span>
          <div className="publish-strategy-tags">
            <Tag closable>高光弹幕</Tag>
            <Tag closable>投票选择</Tag>
            <Tag closable>心动打点</Tag>
          </div>

          <span>封面与简介检查</span>
          <div className="publish-check-status">
            <Tag color="success">封面已完成</Tag>
            <Tag color="success">简介已完成</Tag>
          </div>
        </div>
        <div className="publish-config-actions">
          <Button onClick={() => setConfigOpen(false)}>保存配置</Button>
          <Button>预览效果</Button>
          <Button
            type="primary"
            onClick={() => {
              setConfigOpen(false);
              message.success('发布任务已提交');
            }}
          >
            提交发布
          </Button>
        </div>
      </Modal>
    </section>
  );
}
