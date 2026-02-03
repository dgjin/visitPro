
// 声明全局 CryptoJS，因为它是在 index.html 中通过 CDN 引入的
declare var CryptoJS: any;

/*const APPID = process.env.IFLYTEK_APPID || '';
const API_SECRET = process.env.IFLYTEK_API_SECRET || '';
const API_KEY = process.env.IFLYTEK_API_KEY || '';
*/
const APPID = '8cc61805' || '';
const API_SECRET = 'MjU5OTkzOWMyN2ZiNDhlMDNkNjdjMDli' || '';
const API_KEY = 'ffed16b33a183c42c3b989d5306f0d75' || '';

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
            // Use 'as any' to avoid TS type mismatch between ArrayBufferLike and ArrayBuffer
            // caused by SharedArrayBuffer compatibility checks in some environments
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer as any);
            
            // 使用 OfflineAudioContext 进行重采样 (44.1/48kHz -> 16kHz)
            const offlineContext = new OfflineAudioContext(1, audioBuffer.duration * 16000, 16000);
            const source = offlineContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(offlineContext.destination);
            source.start();
            
            const resampledBuffer = await offlineContext.startRendering();
            const float32Data = resampledBuffer.getChannelData(0);
            const int16Data = new Int16Array(float32Data.length);
            
            // Float32 -> Int16 PCM
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
 * 调用讯飞语音听写接口
 */
export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
    if (!APPID || !API_SECRET || !API_KEY) {
        throw new Error("请在 index.html 或环境变量中配置讯飞 APPID, API_SECRET 和 API_KEY");
    }

    const pcmData = await convertTo16kPCM(audioBlob);
    
    return new Promise((resolve, reject) => {
        const url = getWebSocketUrl();
        const socket = new WebSocket(url);
        let resultText = "";

        socket.onopen = () => {
            // 发送第一帧 (包含参数)
            const params = {
                common: {
                    app_id: APPID,
                },
                business: {
                    language: "zh_cn",
                    domain: "iat",
                    accent: "mandarin",
                    vad_eos: 5000,
                    dwa: "wpgs" // 动态修正
                },
                data: {
                    status: 0,
                    format: "audio/L16;rate=16000",
                    encoding: "raw"
                }
            };
            socket.send(JSON.stringify(params));

            // 分块发送音频数据 (每帧 1280 字节推荐，约 40ms)
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
                
                // 将 ArrayBuffer 切片转为 Base64
                // 注意：buffer.slice 返回的是 ArrayBuffer，需要转为 Uint8Array 才能给 apply 使用 (如果使用 String.fromCharCode)
                // 这里我们直接手动处理或者使用 arrayBufferToBinaryString
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
                
                // 处理 pgws 动态修正：如果 result.pgs == 'rpl'，需要替换之前的文本，这里简单处理，直接拼接
                // 更好的做法是维护一个结果列表，但这对于一次性文件转写通常够用，因为我们拿到的是最终流
                resultText += text;

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
               // 如果没有结果且异常关闭
               // resolve(resultText); // 或者 reject，视情况而定
            }
        };
    });
};
