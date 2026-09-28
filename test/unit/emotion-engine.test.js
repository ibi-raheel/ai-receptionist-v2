import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EmotionEngine } from '../../src/services/emotion-engine.js';

describe('EmotionEngine', () => {
  it('parses emotion prefix correctly', () => {
    const engine = new EmotionEngine();
    const result = engine.parseResponse('[EMOTION:panicked→reassuring] Oh no, let me help.');
    assert.equal(result.callerEmotion, 'panicked');
    assert.equal(result.aiEmotion, 'reassuring');
    assert.equal(result.cleanText, 'Oh no, let me help.');
  });

  it('returns current state when no prefix', () => {
    const engine = new EmotionEngine();
    const result = engine.parseResponse('Just a regular response.');
    assert.equal(result.callerEmotion, 'calm');
    assert.equal(result.aiEmotion, 'cheerful');
    assert.equal(result.cleanText, 'Just a regular response.');
  });

  it('returns voice settings for known emotions', () => {
    const engine = new EmotionEngine();
    engine.parseResponse('[EMOTION:frustrated→empathetic] I totally understand.');
    const settings = engine.getVoiceSettings();
    assert.equal(settings.stability, 0.20);
    assert.equal(settings.style, 0.95);
  });

  it('returns default settings for unknown emotion', () => {
    const engine = new EmotionEngine();
    engine.currentAiEmotion = 'unknown_emotion';
    const settings = engine.getVoiceSettings();
    assert.equal(settings.stability, 0.25); // cheerful default
  });

  it('tracks emotion history', () => {
    const engine = new EmotionEngine();
    engine.parseResponse('[EMOTION:calm→warm] Hi there.');
    engine.parseResponse('[EMOTION:concerned→empathetic] Oh no.');
    engine.parseResponse('[EMOTION:panicked→reassuring] Help!');
    assert.equal(engine.history.length, 3);
    assert.equal(engine.getTrend(), 'escalating');
  });

  it('detects de-escalation', () => {
    const engine = new EmotionEngine();
    engine.parseResponse('[EMOTION:panicked→reassuring] Help!');
    engine.parseResponse('[EMOTION:concerned→empathetic] Okay.');
    engine.parseResponse('[EMOTION:calm→professional] Thanks.');
    assert.equal(engine.getTrend(), 'de-escalating');
  });

  it('generates context string for prompt', () => {
    const engine = new EmotionEngine();
    engine.parseResponse('[EMOTION:frustrated→empathetic] I get it.');
    const ctx = engine.getContextForPrompt();
    assert.ok(ctx.includes('frustrated'));
  });
});
