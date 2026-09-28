import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeUtterance } from '../../src/services/utterance-analyzer.js';

describe('UtteranceAnalyzer', () => {
  it('responds fast to quick responses', () => {
    assert.ok(analyzeUtterance('Yeah').waitMs <= 400);
    assert.ok(analyzeUtterance('no').waitMs <= 400);
    assert.ok(analyzeUtterance('okay').waitMs <= 400);
    assert.ok(analyzeUtterance('sure').waitMs <= 400);
    assert.ok(analyzeUtterance('got it').waitMs <= 400);
  });

  it('waits longer for incomplete sentences ending with conjunctions', () => {
    const result = analyzeUtterance('Mohammed and');
    assert.ok(result.waitMs >= 2000, `Expected >= 2000, got ${result.waitMs}`);
    assert.ok(result.reason.includes('incomplete'));
  });

  it('waits longer for sentences ending with prepositions', () => {
    const result = analyzeUtterance('Can you tell me about');
    assert.ok(result.waitMs >= 2000);
    assert.ok(result.reason.includes('incomplete'));
  });

  it('waits longer for sentences ending with articles', () => {
    const result = analyzeUtterance('I need a');
    assert.ok(result.waitMs >= 2000);
  });

  it('responds faster to complete sentences with punctuation', () => {
    const result = analyzeUtterance('I have flooding in my basement.');
    assert.ok(result.waitMs <= 600, `Expected <= 600, got ${result.waitMs}`);
    assert.ok(result.reason.includes('complete'));
  });

  it('responds fast to questions', () => {
    const result = analyzeUtterance('Can you guys help me?');
    assert.ok(result.waitMs <= 500);
  });

  it('uses moderate wait for ambiguous short phrases', () => {
    const result = analyzeUtterance('water damage');
    assert.ok(result.waitMs >= 800 && result.waitMs <= 1500);
  });

  it('waits longer for phrases without punctuation', () => {
    const result = analyzeUtterance('so I have this issue with my basement');
    assert.ok(result.waitMs >= 1000);
  });

  it('handles empty input', () => {
    const result = analyzeUtterance('');
    assert.ok(result.waitMs >= 1500);
  });

  it('handles the "Mohammed and address" case correctly', () => {
    // First part should wait (incomplete)
    const part1 = analyzeUtterance('Mohammed and');
    assert.ok(part1.waitMs >= 2000, 'Should wait — ends with "and"');

    // Combined should be faster (more complete)
    const combined = analyzeUtterance('Mohammed and address is three five one three');
    assert.ok(combined.waitMs < part1.waitMs, 'Combined should wait less than fragment');
  });

  it('handles the "tell me about how" case correctly', () => {
    const result = analyzeUtterance('Okay. So can you tell me about how');
    assert.ok(result.waitMs >= 2000, 'Should wait — ends with "how"');
  });
});
