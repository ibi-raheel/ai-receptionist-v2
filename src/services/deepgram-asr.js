import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const DEEPGRAM_URL = 'wss://api.deepgram.com/v1/listen';

export class DeepgramASR extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.connected = false;
    this.closed = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({
        model: 'nova-2',
        encoding: 'mulaw',
        sample_rate: '8000',
        channels: '1',
        punctuate: 'true',
        endpointing: '400',
        interim_results: 'true',
        utterance_end_ms: '1000',
      });

      this.ws = new WebSocket(`${DEEPGRAM_URL}?${params}`, {
        headers: {
          Authorization: `Token ${config.deepgram.apiKey}`,
        },
      });

      this.ws.on('open', () => {
        logger.info('Deepgram ASR connected');
        this.connected = true;
        resolve();
      });

      this.ws.on('message', (data) => {
        this._handleMessage(data);
      });

      this.ws.on('error', (err) => {
        logger.error({ err: err.message }, 'Deepgram WebSocket error');
        if (!this.connected) reject(err);
      });

      this.ws.on('close', (code, reason) => {
        logger.info({ code }, 'Deepgram WebSocket closed');
        this.connected = false;
      });
    });
  }

  sendAudio(mulawBytes) {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(mulawBytes);
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Send close message per Deepgram protocol
      this.ws.send(JSON.stringify({ type: 'CloseStream' }));
    }
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

    if (msg.type === 'Results') {
      const alt = msg.channel?.alternatives?.[0];
      if (!alt) return;

      const transcript = alt.transcript?.trim();
      if (!transcript) return;

      if (msg.is_final) {
        logger.info({ transcript }, 'ASR final transcript');
        this.emit('transcript', transcript);
      } else {
        this.emit('partial', transcript);
      }
    } else if (msg.type === 'UtteranceEnd') {
      logger.debug('ASR utterance end');
      this.emit('utterance_end');
    } else if (msg.type === 'SpeechStarted') {
      logger.debug('ASR speech started');
      this.emit('speech_started');
    } else if (msg.type === 'Metadata') {
      logger.debug({ metadata: msg }, 'Deepgram metadata');
    }
  }
}
