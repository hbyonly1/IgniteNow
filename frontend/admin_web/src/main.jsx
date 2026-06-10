import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/base.css';
import './styles/landing.css';
import './styles/workspace.css';
import './styles/auth.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1558ff',
          colorInfo: '#1558ff',
          colorLink: '#1558ff',
          colorText: '#111827',
          colorTextSecondary: '#667085',
          colorBgBase: '#ffffff',
          colorBgContainer: '#ffffff',
          colorBorder: '#dfe4ee',
          colorBorderSecondary: '#eef0f4',
          borderRadius: 6,
          borderRadiusLG: 8,
          borderRadiusSM: 4,
          controlHeight: 38,
          controlHeightSM: 30,
          controlHeightLG: 44,
          fontFamily:
            '"Sofia Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
        },
        components: {
          Button: {
            borderRadius: 6,
            primaryShadow: '0 10px 22px rgba(21, 88, 255, 0.18)',
          },
          Input: {
            borderRadius: 6,
            activeBorderColor: '#1558ff',
            hoverBorderColor: '#cfd6e4',
          },
          InputNumber: {
            borderRadius: 6,
            activeBorderColor: '#1558ff',
            hoverBorderColor: '#cfd6e4',
          },
          Select: {
            borderRadius: 6,
            optionSelectedBg: '#f3f6fb',
            multipleItemBg: '#ffffff',
            multipleItemBorderColor: '#dfe4ee',
          },
          Modal: {
            borderRadiusLG: 12,
            contentBg: '#ffffff',
          },
          Upload: {
            borderRadiusLG: 8,
          },
        },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>,
);
