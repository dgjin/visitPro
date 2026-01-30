import { GoogleGenAI, Type } from "@google/genai";
import { AIAnalysisResult, AIModelProvider, EmailTone } from "../types";

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
      description: "A professional, concise summary of the client visit suitable for CRM entry. Must be strictly based on facts provided.",
    },
    sentiment: {
      type: Type.STRING,
      enum: ["Positive", "Neutral", "Negative"],
      description: "The overall sentiment of the client during the visit.",
    },
    painPoints: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "A list of specific client pain points or challenges mentioned explicitly in the notes.",
    },
    actionItems: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "A list of concrete next steps or action items derived strictly from the notes.",
    },
    followUpEmailDraft: {
      type: Type.STRING,
      description: "A draft for a follow-up email to the client based on the meeting context and requested tone.",
    }
  },
  required: ["summary", "sentiment", "painPoints", "actionItems", "followUpEmailDraft"],
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

// DeepSeek specific implementation
const analyzeWithDeepSeek = async (
  prompt: string
): Promise<AIAnalysisResult> => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error("DeepSeek API Key 未配置 (请检查环境变量 DEEPSEEK_API_KEY)");

    const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
                {
                    role: "system",
                    content: "你是一位严谨的金融资产管理资深业务人员。你能精准识别语音内容并整理成专业金融资产管理公司的报告。请注意：所有分析必须严格基于提供的原始笔记内容，不得凭空捏造数据、痛点或过度推断，确保事实准确。请必须以严格的 JSON 格式回复，不要包含任何 Markdown 格式。JSON 结构需包含: summary(string), sentiment(Positive/Neutral/Negative), painPoints(string array), actionItems(string array), followUpEmailDraft(string)。"
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            stream: false,
            response_format: { type: "json_object" }
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(`DeepSeek API Error: ${err.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    
    if (!text) throw new Error("No response from DeepSeek");

    try {
        return JSON.parse(cleanJsonString(text)) as AIAnalysisResult;
    } catch (parseError) {
        console.error("DeepSeek JSON Parse failed:", text);
        throw new Error("无法解析 DeepSeek 返回的 JSON 数据");
    }
};

const buildPrompt = (clientName: string, clientIndustry: string, rawNotes: string, emailTone: EmailTone) => {
    let toneInstruction = "";
    switch (emailTone) {
        case 'Formal':
            toneInstruction = "正式、专业、礼貌，适合商务沟通。";
            break;
        case 'Friendly':
            toneInstruction = "亲切、热情、有温度，适合关系较好的客户。";
            break;
        case 'Concise':
            toneInstruction = "简明扼要，直奔主题，节省客户时间。";
            break;
    }

    return `
      我刚刚结束了对客户 "${clientName}" 的拜访。
      客户所属行业：${clientIndustry || "未知"}。
      
      这是我的原始会议笔记：
      "${rawNotes}"

      请严格基于上述原始笔记内容进行分析，绝对不要编造笔记中未提及的信息，并提供以下内容（请使用简体中文回复，但 sentiment 字段必须严格保留为英文枚举值）：
      1. 一份专业、简洁的拜访摘要 (summary)，适合录入 信息系统。摘要内容必须完全忠实于原始笔记。
      2. 提取客户提到的具体痛点或挑战列表 (painPoints)。请严格检查笔记，只有在笔记中明确提及或强烈暗示时才列出，如果笔记中没有相关内容，请返回空列表，严禁根据行业背景凭空捏造。
      3. 会议的整体情绪 (sentiment - Positive, Neutral, Negative)。
      4. 具体的后续行动项列表 (actionItems)。仅包含笔记中明确计划的后续步骤。
      5. 一份跟进邮件草稿 (followUpEmailDraft)。
         - 邮件语气要求：${toneInstruction}
         - 邮件内容必须基于笔记中确定的事实。
         - 不要编造客户未提出的需求或讨论点。
    `;
};

export const analyzeVisitNotes = async (
  clientName: string,
  clientIndustry: string,
  rawNotes: string,
  modelProvider: AIModelProvider = 'Gemini',
  emailTone: EmailTone = 'Formal'
): Promise<AIAnalysisResult> => {
  
  const prompt = buildPrompt(clientName, clientIndustry, rawNotes, emailTone);

  if (modelProvider === 'DeepSeek') {
      return analyzeWithDeepSeek(prompt);
  }

  // Default to Gemini
  if (!process.env.API_KEY) {
    console.warn("API Key is missing. Returning mock data.");
    return {
      transcription: rawNotes,
      summary: "未检测到 Gemini API Key。这是模拟摘要。",
      sentiment: "Neutral",
      painPoints: ["模拟痛点1", "模拟痛点2"],
      actionItems: ["检查配置"],
      followUpEmailDraft: "请配置您的 API Key。"
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        systemInstruction: "你是一位严谨的金融资产管理资深业务人员。你能精准识别语音内容并整理成专业金融资产管理公司的报告。重要原则：所有分析摘要、痛点提取和邮件草稿必须严格基于原始笔记内容，不得偏离记录本意，不得无中生有或捏造事实。",
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
      painPoints: [],
      actionItems: ["检查配置"],
      followUpEmailDraft: "请配置您的 API Key。"
    };
  }

  try {
    const prompt = `
      这是一段关于客户 "${clientName}" 拜访记录的语音录音。
      请处理这段音频并完成以下任务（请使用简体中文回复）：
      1. 将语音逐字转写为文本 (transcription)。
      2. 基于语音内容，生成一份专业、简洁的拜访摘要 (summary)。必须完全忠实于语音内容。
      3. 识别客户提及的痛点 (painPoints)。请严格基于语音中客户表达的内容，若未提及则留空，禁止编造。
      4. 分析会议的整体情绪 (sentiment - Positive, Neutral, Negative)。
      5. 提取具体的后续行动项列表 (actionItems)。
      6. 起草一份正式的跟进邮件 (followUpEmailDraft)，内容必须基于事实，不要添加语音中未涉及的话题。
    `;

    // Updated model to gemini-3-flash-preview as per guidelines.
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
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
        systemInstruction: "你是一位严谨的金融资产管理资深业务人员。你能精准识别语音内容并整理成专业金融资产管理公司的报告。请严格忠实于语音内容，不进行过度推断或捏造数据。",
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