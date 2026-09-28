import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export class ElevenLabsTTS extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.connected = false;
    this.closed = false;
    this.speaking = false;
    this.audioChunkCount = 0;
    // Internal buffer for text arriving before connection is ready
    this.pendingText = [];
    this.generationReady = false;
  }

  _createConnection() {
    return new Promise((resolve, reject) => {
      const voiceId = config.elevenlabs.voiceId;
      const params = new URLSearchParams({
        model_id: 'eleven_turbo_v2_5',
        output_format: 'ulaw_8000',
      });

      const ws = new WebSocket(
        `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?${params}`,
        {
          headers: {
            'xi-api-key': config.elevenlabs.apiKey,
          },
        }
      );

      ws.on('open', () => {
        logger.info('ElevenLabs TTS connected');
        this.ws = ws;
        this.connected = true;
        resolve();
      });

      ws.on('message', (data) => {
        this._handleMessage(data);
      });

      ws.on('error', (err) => {
        logger.error({ err: err.message }, 'ElevenLabs WebSocket error');
        if (!this.connected) reject(err);
      });

      ws.on('close', (code) => {
        logger.info({ code }, 'ElevenLabs WebSocket closed');
        if (this.ws === ws) {
          this.connected = false;
        }
      });
    });
  }

  async connect() {
    await this._createConnection();
  }

  /**
   * Start a new speech generation with voice settings.
   * Synchronous from caller's perspective — internally reconnects
   * and buffers text until the connection is ready.
   */
  startGeneration(voiceSettings = {}) {
    this.speaking = true;
    this.generationReady = false;
    this.audioChunkCount = 0;
    this.pendingText = [];

    const settings = {
      stability: voiceSettings.stability ?? 0.5,
      similarity_boost: voiceSettings.similarity_boost ?? 0.75,
      style: voiceSettings.style ?? 0.5,
      use_speaker_boost: true,
    };

    logger.info({ settings }, 'Starting TTS generation');

    // Async reconnect + BOS in background
    this._prepareGeneration(settings);
  }

  async _prepareGeneration(settings) {
    // Reconnect if needed
    if (this.closed) return;
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.connected = false;
      try {
        await this._createConnection();
      } catch (err) {
        logger.error({ err: err.message }, 'ElevenLabs reconnect failed');
        return;
      }
    }

    // If cancelled while reconnecting, bail
    if (!this.speaking) return;

    // Send BOS (beginning of stream) with voice settings
    this._send({
      text: ' ',
      voice_settings: settings,
      generation_config: {
        chunk_length_schedule: [150, 200, 280, 320],
      },
    });

    this.generationReady = true;

    // Flush any buffered text that arrived while connecting
    for (const item of this.pendingText) {
      if (item === null) {
        // Sentinel: this is a flush
        this._send({ text: '' });
        this.speaking = false;
        logger.debug('Flushing TTS (from buffer)');
      } else {
        this._send({ text: item });
      }
    }
    this.pendingText = [];
  }

  /**
   * Send a chunk of text to be spoken.
   */
  sendText(text) {
    if (!this.speaking) return;
    if (!this.generationReady) {
      this.pendingText.push(text);
      return;
    }
    this._send({ text });
  }

  /**
   * Signal end of text input. ElevenLabs will flush remaining audio.
   */
  flush() {
    if (!this.speaking) return;
    if (!this.generationReady) {
      // Queue the flush to be sent after connection is ready
      this.pendingText.push(null);
      return;
    }
    logger.debug('Flushing TTS');
    this._send({ text: '' });
    this.speaking = false;
  }

  /**
   * Cancel current generation by closing and letting next startGeneration reconnect.
   */
  cancel() {
    this.speaking = false;
    this.generationReady = false;
    this.pendingText = [];
    if (this.connected && !this.closed) {
      this.ws?.close();
      this.connected = false;
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.speaking = false;
    this.generationReady = false;
    this.pendingText = [];
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  _handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.audio) {
      this.audioChunkCount++;
      if (this.audioChunkCount === 1) {
        logger.info('First TTS audio chunk received');
      }
      this.emit('audio', msg.audio);
    }

    if (msg.isFinal) {
      logger.info({ audioChunks: this.audioChunkCount }, 'TTS generation complete');
      this.emit('done');
    }

    if (msg.error) {
      logger.error({ error: msg.error }, 'ElevenLabs error');
    }
  }

  _send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      logger.warn('TTS send failed — WebSocket not open');
    }
  }
}
