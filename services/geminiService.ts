import { GoogleGenAI, Type } from "@google/genai";
import { AIAnalysisResult } from "../types";

// Always use named parameter for apiKey and use process.env.API_KEY directly.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    transcription: {
      type: Type.STRING,
      description: "The verbatim transcription of the audio input (if audio was provided).",
    },
    summary: {
      type: Type.STRING,
      description: "A professional, concise summary of the client visit suitable for CRM entry.",
    },
    sentiment: {
      type: Type.STRING,
      enum: ["Positive", "Neutral", "Negative"],
      description: "The overall sentiment of the client during the visit.",
    },
    actionItems: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "A list of concrete next steps or action items derived from the notes.",
    },
    followUpEmailDraft: {
      type: Type.STRING,
      description: "A draft for a follow-up email to the client based on the meeting context.",
    }
  },
  required: ["summary", "sentiment", "actionItems", "followUpEmailDraft"],
};

// Helper to clean JSON string from Markdown code blocks often returned by LLMs
const cleanJsonString = (text: string) => {
  if (!text) return "{}";
  
  // Try to find JSON object brackets
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.substring(firstBrace, lastBrace + 1);
  }
  
  // Fallback: simple markdown stripping
  let clean = text.trim();
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```[a-z]*\n?/, "");
    clean = clean.replace(/\n?```$/, "");
  }
  return clean;
};

export const analyzeVisitNotes = async (
  clientName: string,
  rawNotes: string
): Promise<AIAnalysisResult> => {
  if (!process.env.API_KEY) {
    console.warn("API Key is missing. Returning mock data.");
    return {
      transcription: rawNotes,
      summary: "未检测到 API Key。这是模拟摘要。",
      sentiment: "Neutral",
      actionItems: ["检查配置"],
      followUpEmailDraft: "请配置您的 API Key。"
    };
  }

  try {
    const prompt = `
      我刚刚结束了对客户 "${clientName}" 的拜访。
      这是我的原始会议笔记：
      "${rawNotes}"

      请分析这些笔记并提供以下内容（请使用简体中文回复，但 sentiment 字段必须严格保留为英文枚举值）：
      1. 一份专业、简洁的拜访摘要，适合录入 CRM 系统。
      2. 会议的整体情绪 (Positive, Neutral, Negative)。
      3. 具体的后续行动项列表。
      4. 一份礼貌且相关的跟进邮件草稿，供我发送给客户。
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        systemInstruction: "你是一位专业的销售助理。你的目标是帮助销售代表将凌乱的笔记整理成专业的中文报告。",
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    try {
        return JSON.parse(cleanJsonString(text)) as AIAnalysisResult;
    } catch (parseError) {
        console.error("JSON Parse failed on text:", text);
        throw new Error("无法解析 AI 返回的 JSON 数据");
    }

  } catch (error) {
    console.error("Error analyzing visit notes:", error);
    throw error;
  }
};

export const analyzeVisitAudio = async (
  clientName: string,
  audioBase64: string,
  mimeType: string
): Promise<AIAnalysisResult> => {
  if (!process.env.API_KEY) {
     console.warn("API Key is missing. Returning mock data.");
    return {
      transcription: "模拟语音转写文本...",
      summary: "未检测到 API Key。这是模拟语音摘要。",
      sentiment: "Neutral",
      actionItems: ["检查配置"],
      followUpEmailDraft: "请配置您的 API Key。"
    };
  }

  try {
    const prompt = `
      这是一段关于客户 "${clientName}" 拜访记录的语音录音。
      请处理这段音频并完成以下任务（请使用简体中文回复）：
      1. 将语音逐字转写为文本 (transcription)。
      2. 基于语音内容，生成一份专业、简洁的拜访摘要 (summary)。
      3. 分析会议的整体情绪 (sentiment - Positive, Neutral, Negative)。
      4. 提取具体的后续行动项列表 (actionItems)。
      5. 起草一份跟进邮件 (followUpEmailDraft)。
    `;

    // Use gemini-flash-latest as a stable alias for multimodal tasks like audio processing.
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: audioBase64
            }
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        systemInstruction: "你是一位专业的销售助理。你能精准识别语音内容并整理成专业的 CRM 报告。",
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    try {
        return JSON.parse(cleanJsonString(text)) as AIAnalysisResult;
    } catch (parseError) {
        console.error("JSON Parse failed on text:", text);
        throw new Error("无法解析 AI 返回的 JSON 数据");
    }

  } catch (error) {
    console.error("Error analyzing visit audio:", error);
    throw error;
  }
};