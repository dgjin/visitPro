
export const isSpeechRecognitionSupported = () => {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
};

let recognition: any = null;

export const startLiveTranscription = (
  onResult: (text: string, isFinal: boolean) => void,
  onError: (error: string) => void,
  onEnd: () => void
) => {
  if (!isSpeechRecognitionSupported()) {
    onError("您的浏览器不支持语音识别，请使用 Chrome 或 Edge。");
    return;
  }

  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'zh-CN';

  recognition.onresult = (event: any) => {
    let fullTranscript = '';

    // FIX: Iterate from 0 to capture the entire session history
    // This ensures that when the user pauses and starts a new sentence (creating a new result index),
    // we still concatenate the previous sentences, preventing the "overwrite" bug.
    for (let i = 0; i < event.results.length; ++i) {
      fullTranscript += event.results[i][0].transcript;
    }
    
    // Always send the full transcript of the current session
    onResult(fullTranscript, false);
  };

  recognition.onerror = (event: any) => {
    console.error("Speech Recognition Error", event.error);
    if (event.error === 'not-allowed') {
      onError("无法访问麦克风，请检查权限设置。");
    } else if (event.error === 'no-speech') {
        // Ignore no-speech errors usually, just let it stay open or close quietly
    } else {
      onError(`语音识别错误: ${event.error}`);
    }
  };

  recognition.onend = () => {
    onEnd();
  };

  try {
    recognition.start();
  } catch (e: any) {
    onError(e.message);
  }
};

export const stopLiveTranscription = () => {
  if (recognition) {
    recognition.stop();
    recognition = null;
  }
};
