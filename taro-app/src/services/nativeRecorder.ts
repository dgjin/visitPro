
import Taro from '@tarojs/taro';

export interface RecorderResult {
  tempFilePath: string;
  duration: number;
  fileSize: number;
  base64Data?: string;
}

export class NativeRecorder {
  private recorderManager: Taro.RecorderManager;
  private isRecording: boolean = false;

  constructor() {
    this.recorderManager = Taro.getRecorderManager();
  }

  public start(onStart?: () => void, onError?: (errMsg: string) => void) {
    if (this.isRecording) return;

    this.recorderManager.onStart(() => {
      this.isRecording = true;
      console.log('recorder start');
      if (onStart) onStart();
    });

    this.recorderManager.onError((res) => {
      console.error('recorder error', res);
      this.isRecording = false;
      if (onError) onError(res.errMsg);
    });

    // 微信小程序录音参数
    this.recorderManager.start({
      duration: 600000, // 最长 10 分钟
      sampleRate: 16000, // 采样率 16k，适配讯飞/AI 模型
      numberOfChannels: 1, // 单声道
      encodeBitRate: 48000,
      format: 'mp3', // MP3 格式通用性好，体积小
    });
  }

  public stop(): Promise<RecorderResult> {
    return new Promise((resolve, reject) => {
      if (!this.isRecording) {
        reject(new Error('Recorder is not running'));
        return;
      }

      this.recorderManager.onStop((res) => {
        this.isRecording = false;
        console.log('recorder stop', res);
        
        // 读取文件内容为 Base64，用于发送给 AI
        const fs = Taro.getFileSystemManager();
        fs.readFile({
          filePath: res.tempFilePath,
          encoding: 'base64',
          success: (fileRes) => {
            resolve({
              tempFilePath: res.tempFilePath,
              duration: res.duration,
              fileSize: res.fileSize,
              base64Data: fileRes.data as string
            });
          },
          fail: (err) => {
            console.error('File read failed', err);
            // 即使转 Base64 失败，也返回路径
            resolve({
              tempFilePath: res.tempFilePath,
              duration: res.duration,
              fileSize: res.fileSize
            });
          }
        });
      });

      this.recorderManager.stop();
    });
  }
}

export const nativeRecorder = new NativeRecorder();
