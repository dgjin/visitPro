# VisitPro - 本地部署与使用指南

## 1. 环境要求
*   现代浏览器 (Chrome, Edge, Safari, Firefox)。
*   建议安装 Node.js (v18+) 以便在本地使用构建工具。

## 2. API 凭证配置
在运行之前，您需要在 `index.html` 的 `<script>` 标签中配置相应的 API Key（或通过环境变量注入）：

```javascript
window.process = { 
  env: { 
    API_KEY: "您的_Gemini_API_Key",
    IFLYTEK_APPID: "您的_讯飞_APPID",
    IFLYTEK_API_SECRET: "您的_讯飞_API_SECRET",
    IFLYTEK_API_KEY: "您的_讯飞_API_KEY"
  } 
};
```

*   **Gemini Key**: 在 [Google AI Studio](https://aistudio.google.com/) 获取。
*   **讯飞 Key**: 在 [讯飞开放平台](https://www.xfyun.cn/) 语音听写 (IAT) 控制台获取。
*   **DeepSeek Key**: 在应用内的“系统管理 -> 存储与备份”或“拜访管理 -> AI配置”中手动输入。

## 3. 本地启动
本应用采用了 ESM 模块加载方式，无法直接双击 `index.html` 运行（受跨域限制）。

### 方式 A: 使用 Python (简单)
在项目根目录下运行：
```bash
python -m http.server 8000
```
然后访问 `http://localhost:8000`

### 方式 B: 使用 Node.js (推荐)
安装并运行静态服务器：
```bash
npx serve .
```
访问 `http://localhost:3000`

## 4. 关键配置路径
1.  **切换模型**: 进入“拜访记录 -> 记录新拜访”，点击智能分析按钮左侧的选择框切换 Gemini/DeepSeek。
2.  **配置 DeepSeek**: 第一次切换 DeepSeek 时，会弹出 Key 配置框，该 Key 将加密保存在您的本地浏览器中。
3.  **配置邮件发送器**: 在“拜访管理 -> 跟进邮件草稿”区域点击“设置”图标，配置您的 SMTP 服务器信息（目前为模拟发送）。

## 5. 数据迁移
*   **导出**: 在“系统管理 -> 存储与备份”点击“立即导出备份数据”。
*   **导入**: 点击“选择文件”上传导出的 JSON 备份，即可恢复所有数据。
