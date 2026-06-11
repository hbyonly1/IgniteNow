import { useEffect, useState } from 'react';
import { Button, Form, Input, Spin, Switch, Tabs, message } from 'antd';
import { ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { apiClient, apiErrorMessage } from '../../services/apiClient.js';

export default function SettingsPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [promptTemplate, setPromptTemplate] = useState('');
  const [loadedPromptTemplate, setLoadedPromptTemplate] = useState('');

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [, promptResponse] = await Promise.all([
        apiClient.get('/api/system/settings'),
        apiClient.get('/api/settings/prompt-template'),
      ]);
      const content = promptResponse.data.data?.content ?? '';
      setPromptTemplate(content);
      setLoadedPromptTemplate(content);
    } catch (error) {
      message.error(apiErrorMessage(error, '系统设置加载失败'));
    } finally {
      setLoading(false);
    }
  };

  const restoreDefaults = () => {
    form.resetFields();
    setPromptTemplate(loadedPromptTemplate);
    message.info('已恢复默认设置');
  };

  const applySettings = async () => {
    setSaving(true);
    try {
      await Promise.all([
        apiClient.put('/api/system/settings', {}),
        apiClient.put('/api/settings/prompt-template', { content: promptTemplate }),
      ]);
      setLoadedPromptTemplate(promptTemplate);
      message.success('设置已应用');
    } catch (error) {
      message.error(apiErrorMessage(error, '设置应用失败'));
    } finally {
      setSaving(false);
    }
  };

  const settingsActions = (
    <div className="settings-panel-actions">
      <Button onClick={restoreDefaults}>恢复默认</Button>
      <Button type="primary" loading={saving} onClick={applySettings}>
        应用设置
      </Button>
    </div>
  );

  useEffect(() => {
    Promise.resolve().then(loadSettings);
  }, []);

  return (
    <section className="settings-page">
      <div className="content-page-header">
        <div className="content-page-title">
          <h1>系统设置</h1>
        </div>
      </div>
      <Spin spinning={loading}>
        <div className="settings-tabs-shell">
          <Form form={form} layout="vertical" initialValues={{ placeholder: false }}>
            <Tabs
              className="settings-tabs"
              tabBarExtraContent={
                <Button icon={<ReloadOutlined />} onClick={loadSettings}>
                  重新加载
                </Button>
              }
              items={[
                {
                  key: 'base',
                  label: (
                    <span className="settings-tab-label">
                      <SettingOutlined />
                      基础设置
                    </span>
                  ),
                  children: (
                    <section className="settings-panel">
                      <div className="settings-grid">
                        <Form.Item name="placeholder" label="配置项占位" valuePropName="checked">
                          <Switch disabled />
                        </Form.Item>
                        <div className="settings-prompt-editor">
                          <h3>AI 识别 Prompt</h3>
                          <p>用于指导 AI 输出高光识别结果，必须保留 highlights 与 highlight_type 等结构化字段要求。</p>
                          <Input.TextArea
                            rows={14}
                            value={promptTemplate}
                            onChange={(event) => setPromptTemplate(event.target.value)}
                          />
                        </div>
                      </div>
                      {settingsActions}
                    </section>
                  ),
                },
              ]}
            />
          </Form>
        </div>
      </Spin>
    </section>
  );
}
