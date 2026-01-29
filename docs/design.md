# VisitPro - 详细设计说明书

## 1. 系统架构
本系统采用纯前端（Client-side Only）架构设计，核心业务逻辑在浏览器端运行。

*   **UI 框架**: React 19
*   **样式库**: Tailwind CSS
*   **图标库**: Lucide React
*   **图表库**: Recharts
*   **AI 接口**: 
    *   Google Gemini API (通过 `@google/genai` SDK)
    *   DeepSeek API (通过标准 Fetch 请求)
    *   科大讯飞 IAT (WebSocket 连接，用于语音转写)

## 2. 数据模型设计 (TypeScript)

### 2.1 核心实体
*   **Client**: 存储客户基础信息及状态。
*   **Visit**: 存储拜访记录、AI 分析结果（摘要、情绪、行动项）及附件信息。
*   **User**: 存储团队成员信息及权限。

### 2.2 扩展性设计
*   **CustomFieldDefinition**: 定义动态字段的属性（目标对象、类型、标签）。
*   **CustomFieldData**: 具体的字段值映射。

### 2.3 存储结构 (StorageSettings)
*   `LOCAL_FILE`: 默认模式，数据持久化于浏览器的 `localStorage`。
*   `MYSQL`: 预留模式，定义了数据库连接元数据。

## 3. 关键功能模块设计

### 3.1 AI 分析服务 (geminiService.ts)
*   **提示词工程 (Prompt Engineering)**: 封装了复杂的销售助手系统指令。
*   **响应处理**: 通过 `cleanJsonString` 函数过滤 LLM 返回的 Markdown 标识符，确保 JSON 解析成功。
*   **多模型适配**: 抽象化分析接口，根据配置路由至不同的模型 API。

### 3.2 语音处理模块 (iflytekService.ts)
*   **音频转换**: 利用 `OfflineAudioContext` 将浏览器捕获的 WebM/Opus 格式转换为讯飞要求的 PCM (16k/16bit/Mono)。
*   **WebSocket 鉴权**: 在前端通过 `CryptoJS` 实时生成基于 HMAC-SHA256 的签名，确保存取安全。

### 3.3 状态管理与自动保存
*   使用 React `useState` 管理 UI 状态。
*   通过 `useEffect` 监听表单变化，实现 1 秒延迟的草稿自动保存（`visit_pro_form_draft`）。

## 4. 交互细节
*   **折叠控制**: 原始笔记与摘要区域支持动态高度切换，通过 `style={{ height: ... }}` 强制渲染。
*   **附件处理**: 附件以 Base64 DataURL 形式存储，适合演示环境。
