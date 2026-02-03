# VisitPro - 系统详细设计说明书

## 1. 架构总览
本系统采用 **前端驱动架构 (Frontend-Driven Architecture)**。
*   **Web 端**：React 19 + Tailwind CSS (用于桌面及 Pad 访问)。
*   **小程序端**：Taro 3.6 + React (针对 iPhone 15 Pro Max 深度优化)。
*   **AI 接入层**：通过自定义 Service 封装 Google Generative AI SDK 与 RESTful DeepSeek API。

## 2. 核心 Service 设计

### 2.1 AI 模型路由调度 (geminiService.ts)
系统实现了一个双模型决策器：
*   **Gemini 引擎**：利用 `gemini-3-flash-preview` 处理多模态输入（Audio Inline Data），直接实现“语音 -> 结构化报告”的跨越式处理。
*   **DeepSeek 引擎**：作为文本增强引擎，通过 `Taro.request` 访问外部 API，配合 JSON Response Format 确保输出稳定性。
*   **Response Cleaning**：由于 LLM 倾向于返回 Markdown 代码块，Service 层包含 `cleanJsonString` 正则过滤逻辑。

### 2.2 数据持久化策略 (storage.ts)
*   **版本迁移逻辑**：在 `getStorageData` 时自动检测 `v4` 之前的数据结构，并注入默认的 `emailConfig` 和 `aiConfig` 对象，确保向前兼容。
*   **动态字段映射**：
    *   字段定义存储在 `fieldDefinitions`。
    *   具体值存储在各实体的 `customFields` 数组中。
    *   UI 层通过 `Record<fieldId, value>` 进行状态同步，提交时转化为数组。

### 2.3 语音处理链 (iflytekService.ts / nativeRecorder.ts)
*   **Taro 录音**：使用 `RecorderManager` 配置 16k 采样率及 MP3 格式。
*   **PCM 转换**：在 Web 端利用 `OfflineAudioContext` 将音频流重采样并量化为 16-bit PCM 片段，以满足讯飞 WebSocket 协议。

## 3. 页面模块设计

### 3.1 拜访管理模块 (Visit Manager)
*   **状态机视图**：`LIST` | `CREATE` | `CALENDAR`。
*   **全屏编辑器**：通过固定定位 (`fixed inset-0`) 实现的 `Z-INDEX 100` 编辑层，专为 iPhone 15 高清大屏设计的排版间距。
*   **自动保存逻辑**：使用 `useEffect` 挂载 `setTimeout` 延迟 1000ms 触发 `localStorage` 写入，实现“无感草稿”。

### 3.2 仪表盘可视化
*   **Web 端**：集成 `Recharts` 库。
*   **小程序端**：考虑到小程序对 Canvas 渲染的性能损耗，柱状图采用 **Flex 布局 + CSS 变量高度** 实现，确保动态响应极速。

## 4. iPhone 15 Pro Max 专项适配
*   **安全区域变量**：
    ```css
    :root {
      --safe-area-top: env(safe-area-inset-top);
      --safe-area-bottom: env(safe-area-inset-bottom);
    }
    ```
*   **UI 规范**：
    *   **Tabbar**：底部间距补偿，防止 Home Indicator 遮挡。
    *   **Modal**：侧边弹出采用 `animate-scale-in` 或 `animate-slide-up` 动画。
    *   **阴影**：采用 `shadow-blue-100` 等软阴影，提升 iOS 质感。

## 5. 存储模型 (TypeScript)
```typescript
interface Visit {
  id: string;
  category: 'Outbound' | 'Inbound'; // 新增：分类字段
  rawNotes: string;               // 原始笔记（含转写内容）
  summary: string;                // AI 生成摘要
  outcome: 'Positive' | 'Neutral' | 'Negative'; // AI 情绪判断
  customFields: CustomFieldData[]; // 动态字段扩展
  attachments: Attachment[];       // 语音/图片附件
}
```
