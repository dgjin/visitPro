
// 声明全局 CryptoJS，因为它是在 index.html 中通过 CDN 引入的
declare var CryptoJS: any;

/*const APPID = process.env.IFLYTEK_APPID || '';
const API_SECRET = process.env.IFLYTEK_API_SECRET || '';
const API_KEY = process.env.IFLYTEK_API_KEY || '';
*/
const APPID = '8cc61805' || '';
const API_SECRET = 'MjU5OTkzOWMyN2ZiNDhlMDNkNjdjMDli' || '';
const API_KEY = 'ffed16b33a183c42c3b989d5306f0d75' || '';

// Global variables to manage live session state
let socket: WebSocket | null = null;
let audioContext: AudioContext | null = null;
let scriptProcessor: ScriptProcessorNode | null = null;
let mediaStream: MediaStream | null = null;

/**
 * 将 AudioBlob (通常是 WebM/Opus) 转换为讯飞所需的 PCM 16k 16bit 单声道格式
 */
const convertTo16kPCM = async (audioBlob: Blob): Promise<ArrayBuffer> => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const fileReader = new FileReader();
  
  return new Promise((resolve, reject) => {
    fileReader.onload = async (e) => {
        try {
            const arrayBuffer = e.target?.result;
            if (!arrayBuffer || typeof arrayBuffer === 'string') {
                reject(new Error("Failed to read audio file"));
                return;
            }
            // Use 'as any' to avoid TS type mismatch
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer as any);
            
            const offlineContext = new OfflineAudioContext(1, audioBuffer.duration * 16000, 16000);
            const source = offlineContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(offlineContext.destination);
            source.start();
            
            const resampledBuffer = await offlineContext.startRendering();
            const float32Data = resampledBuffer.getChannelData(0);
            const int16Data = new Int16Array(float32Data.length);
            
            for (let i = 0; i < float32Data.length; i++) {
                const s = Math.max(-1, Math.min(1, float32Data[i]));
                int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            
            resolve(int16Data.buffer as ArrayBuffer);
        } catch (err) {
            reject(err);
        }
    };
    fileReader.onerror = reject;
    fileReader.readAsArrayBuffer(audioBlob);
  });
};

/**
 * 生成讯飞 WebSocket 连接 URL (包含鉴权签名)
 */
const getWebSocketUrl = () => {
    const url = "wss://iat-api.xfyun.cn/v2/iat";
    const host = "iat-api.xfyun.cn";
    const date = new Date().toUTCString();
    const algorithm = "hmac-sha256";
    const headers = "host date request-line";
    const signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v2/iat HTTP/1.1`;
    
    const signatureSha = CryptoJS.HmacSHA256(signatureOrigin, API_SECRET);
    const signature = CryptoJS.enc.Base64.stringify(signatureSha);
    
    const authorizationOrigin = `api_key="${API_KEY}", algorithm="${algorithm}", headers="${headers}", signature="${signature}"`;
    const authorization = btoa(authorizationOrigin);
    
    return `${url}?authorization=${authorization}&date=${date}&host=${host}`;
};

/**
 * 启动实时语音转写
 */
export const startLiveTranscription = async (
    onTextUpdate: (text: string) => void,
    onError: (error: string) => void
) => {
    if (!APPID || !API_SECRET || !API_KEY) {
        onError("请在 index.html 或环境变量中配置讯飞 APPID, API_SECRET 和 API_KEY");
        return;
    }

    try {
        // 1. Setup Audio Input
        // Request 16k directly to let browser handle hardware resampling
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
                sampleRate: 16000, 
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true
            } 
        });

        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const source = audioContext.createMediaStreamSource(mediaStream);
        scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

        // 2. Setup WebSocket
        const url = getWebSocketUrl();
        socket = new WebSocket(url);
        let currentText = "";

        socket.onopen = () => {
            console.log("iFlytek WebSocket Connected");
            // Send Handshake Frame
            const params = {
                common: { app_id: APPID },
                business: {
                    language: "zh_cn",
                    domain: "iat",
                    accent: "mandarin",
                    vad_eos: 5000,
                    dwa: "wpgs" // 开启动态修正
                },
                data: {
                    status: 0,
                    format: "audio/L16;rate=16000",
                    encoding: "raw"
                }
            };
            socket?.send(JSON.stringify(params));
        };

        socket.onmessage = (e) => {
            const response = JSON.parse(e.data);
            if (response.code !== 0) {
                console.error("iFlytek Error:", response);
                onError(`API Error: ${response.code} ${response.message}`);
                stopLiveTranscription();
                return;
            }

            if (response.data && response.data.result) {
                const ws = response.data.result.ws;
                let str = "";
                ws.forEach((w: any) => {
                    w.cw.forEach((c: any) => {
                        str += c.w;
                    });
                });
                
                // Note: For simplicity in this demo we accumulate text.
                // A robust implementation would handle 'pgs' (progressive) replacement logic.
                currentText += str;
                onTextUpdate(currentText);

                if (response.data.status === 2) {
                    // Session ended by server
                    // stopLiveTranscription(); // Optional: auto stop or wait for user
                }
            }
        };

        socket.onerror = (e) => {
            console.error("WebSocket Error", e);
            onError("WebSocket Connection Error");
        };

        socket.onclose = () => {
            console.log("iFlytek WebSocket Closed");
        };

        // 3. Process Audio
        scriptProcessor.onaudioprocess = (e) => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                const inputData = e.inputBuffer.getChannelData(0);
                
                // Convert Float32 to Int16
                const buffer = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                // Base64 Encode
                const bytes = new Uint8Array(buffer.buffer);
                let binary = '';
                const len = bytes.byteLength;
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                const base64Audio = btoa(binary);

                // Send Data Frame
                socket.send(JSON.stringify({
                    data: {
                        status: 1,
                        format: "audio/L16;rate=16000",
                        encoding: "raw",
                        audio: base64Audio
                    }
                }));
            }
        };

        // Connect nodes
        source.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);

    } catch (err: any) {
        console.error("Start Live Transcription Failed:", err);
        onError(err.message || "Failed to start microphone");
    }
};

/**
 * 停止实时语音转写
 */
export const stopLiveTranscription = () => {
    if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    if (socket) {
        if (socket.readyState === WebSocket.OPEN) {
            // Send End Frame
            socket.send(JSON.stringify({
                data: {
                    status: 2,
                    format: "audio/L16;rate=16000",
                    encoding: "raw",
                    audio: ""
                }
            }));
            socket.close();
        }
        socket = null;
    }
};

/**
 * 遗留方法：调用讯飞语音听写接口 (Blob 模式)
 * 保留以兼容旧代码，但建议迁移到 startLiveTranscription
 */
export const transcribeAudio = async (
    audioBlob: Blob,
    onProgress?: (text: string) => void
): Promise<string> => {
    if (!APPID || !API_SECRET || !API_KEY) {
        throw new Error("请在 index.html 或环境变量中配置讯飞 APPID, API_SECRET 和 API_KEY");
    }

    const pcmData = await convertTo16kPCM(audioBlob);
    
    return new Promise((resolve, reject) => {
        const url = getWebSocketUrl();
        const socket = new WebSocket(url);
        let resultText = "";

        socket.onopen = () => {
            const params = {
                common: { app_id: APPID },
                business: {
                    language: "zh_cn",
                    domain: "iat",
                    accent: "mandarin",
                    vad_eos: 5000,
                    dwa: "wpgs"
                },
                data: {
                    status: 0,
                    format: "audio/L16;rate=16000",
                    encoding: "raw"
                }
            };
            socket.send(JSON.stringify(params));

            const buffer = new Uint8Array(pcmData);
            const chunkSize = 1280; 
            let offset = 0;

            const sendLoop = setInterval(() => {
                if (socket.readyState !== WebSocket.OPEN) {
                    clearInterval(sendLoop);
                    return;
                }

                const end = Math.min(offset + chunkSize, buffer.length);
                const isLast = end === buffer.length;
                
                let binary = '';
                const bytes = buffer.subarray(offset, end);
                const len = bytes.byteLength;
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                const audioBase64 = btoa(binary);

                socket.send(JSON.stringify({
                    data: {
                        status: isLast ? 2 : 1,
                        format: "audio/L16;rate=16000",
                        encoding: "raw",
                        audio: audioBase64
                    }
                }));

                offset = end;
                if (isLast) {
                    clearInterval(sendLoop);
                }
            }, 40);
        };

        socket.onmessage = (e) => {
            const response = JSON.parse(e.data);
            if (response.code !== 0) {
                socket.close();
                reject(new Error(`讯飞 API 错误: ${response.code} - ${response.message}`));
                return;
            }

            if (response.data && response.data.result) {
                const ws = response.data.result.ws;
                let text = "";
                ws.forEach((w: any) => {
                    w.cw.forEach((c: any) => {
                        text += c.w;
                    });
                });
                
                resultText += text;
                
                if (onProgress) {
                    onProgress(resultText);
                }

                if (response.data.status === 2) {
                    socket.close();
                    resolve(resultText);
                }
            }
        };

        socket.onerror = (e) => {
            reject(new Error("WebSocket 连接错误"));
        };

        socket.onclose = (e) => {
            if (!resultText && e.code !== 1000) {
               // handle abnormal close
            }
        };
    });
};
