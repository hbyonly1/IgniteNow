import { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Spin, Switch, Tabs, message } from 'antd';
import { ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { apiClient, apiErrorMessage } from '../../services/apiClient.js';

export default function SettingsPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [promptTemplate, setPromptTemplate] = useState('');
  const [loadedPromptTemplate, setLoadedPromptTemplate] = useState('');
  const [loadedSettings, setLoadedSettings] = useState({});
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsResponse, promptResponse] = await Promise.all([
        apiClient.get('/api/system/settings'),
        apiClient.get('/api/settings/prompt-template'),
      ]);
      const settings = settingsResponse.data.data?.settings ?? {};
      const llm = settings.llm ?? {};
      const content = promptResponse.data.data?.content ?? '';
      setLoadedSettings(settings);
      setApiKeyConfigured(Boolean(llm.api_key_configured));
      form.setFieldsValue({
        llm: {
          enabled: llm.enabled ?? true,
          api_key: '',
          clear_api_key: false,
          base_url: llm.base_url ?? 'https://api.openai.com/v1',
          model: llm.model ?? 'gpt-4o-mini',
          timeout_seconds: llm.timeout_seconds ?? 90,
        },
      });
      setPromptTemplate(content);
      setLoadedPromptTemplate(content);
    } catch (error) {
      message.error(apiErrorMessage(error, '系统设置加载失败'));
    } finally {
      setLoading(false);
    }
  }, [form]);

  const restoreDefaults = () => {
    const llm = loadedSettings.llm ?? {};
    form.setFieldsValue({
      llm: {
        enabled: llm.enabled ?? true,
        api_key: '',
        clear_api_key: false,
        base_url: llm.base_url ?? 'https://api.openai.com/v1',
        model: llm.model ?? 'gpt-4o-mini',
        timeout_seconds: llm.timeout_seconds ?? 90,
      },
    });
    setPromptTemplate(loadedPromptTemplate);
    message.info('已恢复默认设置');
  };

  const applySettings = async () => {
    setSaving(true);
    try {
      const values = await form.validateFields();
      await Promise.all([
        apiClient.put('/api/system/settings', values),
        apiClient.put('/api/settings/prompt-template', { content: promptTemplate }),
      ]);
      const nextSettingsResponse = await apiClient.get('/api/system/settings');
      const nextSettings = nextSettingsResponse.data.data?.settings ?? {};
      setLoadedSettings(nextSettings);
      setApiKeyConfigured(Boolean(nextSettings.llm?.api_key_configured));
      form.setFieldValue(['llm', 'api_key'], '');
      form.setFieldValue(['llm', 'clear_api_key'], false);
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
  }, [loadSettings]);

  return (
    <section className="settings-page">
      <div className="content-page-header">
        <div className="content-page-title">
          <h1>系统设置</h1>
        </div>
      </div>
      <Spin spinning={loading}>
        <div className="settings-tabs-shell">
          <Form
            form={form}
            layout="vertical"
            initialValues={{
              llm: {
                enabled: true,
                api_key: '',
                clear_api_key: false,
                base_url: 'https://api.openai.com/v1',
                model: 'gpt-4o-mini',
                timeout_seconds: 90,
              },
            }}
          >
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
                        <Form.Item name={['llm', 'enabled']} label="启用 AI 识别" valuePropName="checked">
                          <Switch />
                        </Form.Item>
                        <Form.Item
                          name={['llm', 'api_key']}
                          label={apiKeyConfigured ? 'API Key（已配置）' : 'API Key'}
                          extra={apiKeyConfigured ? '已保存 API Key；留空不会覆盖现有密钥。' : undefined}
                        >
                          <Input placeholder={apiKeyConfigured ? '留空保持现有 API Key' : '请输入 API Key'} autoComplete="off" />
                        </Form.Item>
                        <Form.Item name={['llm', 'clear_api_key']} label="清除已保存 API Key" valuePropName="checked">
                          <Switch />
                        </Form.Item>
                        <Form.Item
                          name={['llm', 'base_url']}
                          label="API Base URL"
                          rules={[{ required: true, message: '请输入 API Base URL' }]}
                        >
                          <Input placeholder="https://api.openai.com/v1" />
                        </Form.Item>
                        <Form.Item
                          name={['llm', 'model']}
                          label="模型"
                          rules={[{ required: true, message: '请输入模型名称' }]}
                        >
                          <Input placeholder="gpt-4o-mini" />
                        </Form.Item>
                        <Form.Item
                          name={['llm', 'timeout_seconds']}
                          label="超时时间（秒）"
                          rules={[{ required: true, message: '请输入超时时间' }]}
                        >
                          <InputNumber min={5} max={300} step={5} />
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
