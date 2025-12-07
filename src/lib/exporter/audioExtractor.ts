import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

/**
 * Extracts audio from a video file and returns it as PCM data
 * that can be processed with WebCodecs AudioEncoder
 */
export class AudioExtractor {
  private ffmpeg: FFmpeg | null = null;
  private loaded = false;

  async initialize(): Promise<void> {
    if (this.loaded) return;

    try {
      this.ffmpeg = new FFmpeg();
      
      // Load FFmpeg core - use the version that matches @ffmpeg/ffmpeg
      // Try CDN first, fallback to local if available
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      
      console.log('[AudioExtractor] Loading FFmpeg core from CDN...');
      await this.ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      this.loaded = true;
      console.log('[AudioExtractor] FFmpeg loaded successfully');
    } catch (error) {
      console.error('[AudioExtractor] Failed to load FFmpeg:', error);
      throw new Error(`Failed to initialize FFmpeg: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extracts audio from a video file and returns it as Opus-encoded data
   */
  async extractAudio(videoUrl: string): Promise<Uint8Array | null> {
    if (!this.ffmpeg || !this.loaded) {
      await this.initialize();
    }

    try {
      const ffmpeg = this.ffmpeg!;
      
      // Fetch the video file
      const videoData = await fetchFile(videoUrl);
      
      // Write video to FFmpeg's virtual filesystem
      await ffmpeg.writeFile('input.webm', videoData);
      
      // Extract audio as Opus
      // -i input.webm: input file
      // -vn: no video
      // -acodec libopus: encode as Opus
      // -ar 48000: sample rate 48kHz
      // -ac 2: stereo
      // -b:a 128k: bitrate 128kbps
      // -f opus: output format Opus
      await ffmpeg.exec([
        '-i', 'input.webm',
        '-vn',
        '-acodec', 'libopus',
        '-ar', '48000',
        '-ac', '2',
        '-b:a', '128000',
        '-f', 'opus',
        'output.opus'
      ]);

      // Read the extracted audio
      const audioData = await ffmpeg.readFile('output.opus');
      
      // Clean up
      await ffmpeg.deleteFile('input.webm');
      await ffmpeg.deleteFile('output.opus');

      if (audioData instanceof Uint8Array) {
        console.log('[AudioExtractor] Audio extracted successfully, size:', audioData.length);
        return audioData;
      } else {
        console.warn('[AudioExtractor] Audio extraction returned unexpected type');
        return null;
      }
    } catch (error) {
      console.error('[AudioExtractor] Error extracting audio:', error);
      return null;
    }
  }

  /**
   * Extracts audio as raw PCM for WebCodecs processing
   */
  async extractAudioAsPCM(videoUrl: string): Promise<Float32Array[] | null> {
    if (!this.ffmpeg || !this.loaded) {
      await this.initialize();
    }

    if (!this.ffmpeg) {
      console.error('[AudioExtractor] FFmpeg not initialized');
      return null;
    }

    try {
      const ffmpeg = this.ffmpeg;
      
      console.log('[AudioExtractor] Fetching video file:', videoUrl);
      
      // Use fetch() for file:// URLs in Electron (works in renderer process)
      // Use fetchFile for blob/http URLs
      let videoData: Uint8Array;
      if (videoUrl.startsWith('file://')) {
        try {
          console.log('[AudioExtractor] Reading file:// URL using fetch()');
          const response = await fetch(videoUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          videoData = new Uint8Array(arrayBuffer);
          console.log('[AudioExtractor] File read via fetch, size:', videoData.byteLength);
        } catch (error) {
          console.error('[AudioExtractor] Fetch failed for file:// URL:', error);
          // Try fetchFile as fallback
          try {
            console.log('[AudioExtractor] Trying fetchFile as fallback...');
            videoData = await fetchFile(videoUrl);
            console.log('[AudioExtractor] File fetched via fetchFile, size:', videoData.byteLength);
          } catch (fetchFileError) {
            throw new Error(`Failed to read video file: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      } else {
        // For blob URLs or http URLs, use fetchFile
        console.log('[AudioExtractor] Using fetchFile for blob/http URL');
        videoData = await fetchFile(videoUrl);
        console.log('[AudioExtractor] File fetched via fetchFile, size:', videoData.byteLength);
      }
      
      if (!videoData || videoData.length === 0) {
        throw new Error('Video file is empty or could not be read');
      }
      
      console.log('[AudioExtractor] Video file ready, size:', videoData.byteLength, 'bytes');
      
      // Determine input file extension
      const isWebM = videoUrl.includes('.webm');
      const inputFileName = isWebM ? 'input.webm' : 'input.mp4';
      
      // Write video to FFmpeg's virtual filesystem
      console.log('[AudioExtractor] Writing video to FFmpeg filesystem...');
      await ffmpeg.writeFile(inputFileName, videoData);
      
      // Extract audio as raw PCM (f32le = 32-bit float little-endian)
      // -i input: input file (auto-detected format)
      // -vn: no video
      // -acodec pcm_f32le: PCM 32-bit float
      // -ar 48000: sample rate 48kHz
      // -ac 2: stereo
      // -f f32le: output format 32-bit float little-endian
      console.log('[AudioExtractor] Extracting audio as PCM from', inputFileName, '...');
      try {
        await ffmpeg.exec([
          '-i', inputFileName,
          '-vn',
          '-acodec', 'pcm_f32le',
          '-ar', '48000',
          '-ac', '2',
          '-f', 'f32le',
          'output.pcm'
        ]);
        console.log('[AudioExtractor] FFmpeg exec completed successfully');
      } catch (error) {
        console.error('[AudioExtractor] FFmpeg exec failed:', error);
        // Check if output file exists anyway
        try {
          const files = await ffmpeg.listDir('/');
          console.log('[AudioExtractor] FFmpeg filesystem contents:', files);
        } catch (e) {
          console.error('[AudioExtractor] Could not list FFmpeg filesystem:', e);
        }
        throw error;
      }

      // Read the extracted audio
      console.log('[AudioExtractor] Reading extracted audio...');
      const pcmData = await ffmpeg.readFile('output.pcm');
      
      // Clean up
      await ffmpeg.deleteFile(inputFileName).catch(() => {});
      await ffmpeg.deleteFile('output.pcm').catch(() => {});

      if (pcmData instanceof Uint8Array) {
        // Convert to Float32Array and split into channels
        const floatData = new Float32Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 4);
        const sampleRate = 48000;
        const channels = 2;
        const samplesPerChannel = floatData.length / channels;
        
        // Split into separate channels
        const channelData: Float32Array[] = [];
        for (let ch = 0; ch < channels; ch++) {
          const channel = new Float32Array(samplesPerChannel);
          for (let i = 0; i < samplesPerChannel; i++) {
            channel[i] = floatData[i * channels + ch];
          }
          channelData.push(channel);
        }

        console.log('[AudioExtractor] Audio extracted as PCM, samples:', samplesPerChannel, 'channels:', channels);
        return channelData;
      } else {
        console.warn('[AudioExtractor] PCM extraction returned unexpected type');
        return null;
      }
    } catch (error) {
      console.error('[AudioExtractor] Error extracting audio as PCM:', error);
      return null;
    }
  }

  cleanup(): void {
    // FFmpeg cleanup is handled automatically
    this.ffmpeg = null;
    this.loaded = false;
  }
}

