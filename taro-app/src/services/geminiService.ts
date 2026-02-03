
import Taro from '@tarojs/taro';
import { GoogleGenAI, Type } from "@google/genai";
import { AIAnalysisResult, AIModelProvider } from "../types";
import { getStorageData } from "./storage";

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    transcription: { type: Type.STRING, description: "Verbatim transcription." },
    summary: { type: Type.STRING, description: "Professional summary." },
    sentiment: { type: Type.STRING, enum: ["Positive", "Neutral", "Negative"], description: "Overall sentiment." },
    painPoints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Pain points list." },
    actionItems: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Action items list." },
    followUpEmailDraft: { type: Type.STRING, description: "Email draft." }
  },
  required: ["summary", "sentiment", "painPoints", "actionItems", "followUpEmailDraft"],
};

const cleanJsonString = (text: string) => {
  if (!text) return "{}";
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.substring(firstBrace, lastBrace + 1);
  }
  let clean = text.trim();
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "");
  }
  return clean;
};

// DeepSeek specific implementation
const analyzeWithDeepSeek = async (prompt: string, apiKey: string): Promise<AIAnalysisResult> => {
    return new Promise((resolve, reject) => {
        Taro.request({
            url: "https://api.deepseek.com/chat/completions",
            method: "POST",
            header: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            data: {
                model: "deepseek-chat",
                messages: [
                    {
                        role: "system",
                        content: "你是一位严谨的金融资深业务人员。请以严格的 JSON 格式回复，不要包含 Markdown。JSON 结构需包含: summary(string), sentiment(Positive/Neutral/Negative), painPoints(string array), actionItems(string array), followUpEmailDraft(string), transcription(string)."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                stream: false,
                response_format: { type: "json_object" }
            },
            success: (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`DeepSeek Error: ${res.statusCode} ${res.errMsg}`));
                    return;
                }
                try {
                    const text = res.data.choices?.[0]?.message?.content;
                    const result = JSON.parse(cleanJsonString(text || "{}"));
                    resolve(result);
                } catch (e) {
                    reject(new Error("Failed to parse DeepSeek response"));
                }
            },
            fail: (err) => {
                reject(new Error("Network request failed: " + err.errMsg));
            }
        });
    });
};

const buildPrompt = (clientName: string, rawNotes: string) => {
    return `
      分析客户 "${clientName}" 的拜访记录。
      
      原始笔记/语音内容：
      "${rawNotes}"

      请提供（简体中文）：
      1. 摘要 (summary)
      2. 痛点列表 (painPoints)
      3. 情绪 (sentiment: Positive/Neutral/Negative)
      4. 行动项 (actionItems)
      5. 邮件草稿 (followUpEmailDraft)
    `;
};

export const analyzeVisitNotes = async (
  clientName: string,
  rawNotes: string,
): Promise<AIAnalysisResult> => {
  const data = getStorageData();
  const settings = data.settings;
  const activeModel = settings.aiConfig.activeModel;

  const prompt = buildPrompt(clientName, rawNotes);

  if (activeModel === 'DeepSeek') {
      const dsKey = settings.aiConfig.deepSeekApiKey;
      if (!dsKey) throw new Error("DeepSeek API Key 未配置，请在「我的 -> 系统设置」中配置。");
      return analyzeWithDeepSeek(prompt, dsKey);
  } 

  // Default Gemini
  const geminiKey = settings.geminiApiKey;
  if (!geminiKey) throw new Error("Gemini API Key 未配置，请在「我的 -> 系统设置」中配置。");

  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
      },
    });
    return JSON.parse(cleanJsonString(response.text || "{}")) as AIAnalysisResult;
  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    throw new Error(error.message || "Gemini 分析失败");
  }
};

export const analyzeVisitAudio = async (
  clientName: string,
  audioBase64: string, 
  mimeType: string = 'audio/mp3'
): Promise<AIAnalysisResult> => {
  const data = getStorageData();
  const settings = data.settings;
  const geminiKey = settings.geminiApiKey;

  // Gemini is preferred for audio multimodal analysis
  if (!geminiKey) throw new Error("录音分析需要配置 Gemini API Key。");

  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const prompt = `分析关于客户 "${clientName}" 的这段语音记录。请转写并提取摘要、痛点、情绪、行动项和邮件草稿。`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: audioBase64 } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
      },
    });

    return JSON.parse(cleanJsonString(response.text || "{}")) as AIAnalysisResult;
  } catch (error: any) {
    console.error("AI Audio Analysis Error:", error);
    throw new Error(error.message || "AI 语音分析失败");
  }
};
