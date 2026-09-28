import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConversationFSM } from '../../src/state/conversation-fsm.js';

describe('ConversationFSM', () => {
  it('starts at GREETING state', () => {
    const fsm = new ConversationFSM();
    assert.equal(fsm.getState(), 'GREETING');
  });

  it('transitions to valid next state', () => {
    const fsm = new ConversationFSM();
    assert.ok(fsm.transition('EMPATHY'));
    assert.equal(fsm.getState(), 'EMPATHY');
  });

  it('allows staying in same state', () => {
    const fsm = new ConversationFSM();
    assert.ok(fsm.transition('GREETING'));
    assert.equal(fsm.getState(), 'GREETING');
  });

  it('allows skip-forward transitions', () => {
    const fsm = new ConversationFSM();
    assert.ok(fsm.transition('CONTACT_CAPTURE'));
    assert.equal(fsm.getState(), 'CONTACT_CAPTURE');
  });

  it('rejects invalid state names', () => {
    const fsm = new ConversationFSM();
    assert.equal(fsm.transition('NONEXISTENT'), false);
    assert.equal(fsm.getState(), 'GREETING');
  });

  it('tracks history', () => {
    const fsm = new ConversationFSM();
    fsm.transition('EMPATHY');
    fsm.transition('PROBLEM_DISCOVERY');
    assert.deepEqual(fsm.history, ['GREETING', 'EMPATHY', 'PROBLEM_DISCOVERY']);
  });

  it('provides prompt context', () => {
    const fsm = new ConversationFSM();
    const ctx = fsm.getPromptContext();
    assert.ok(ctx.includes('GREETING'));
    assert.ok(ctx.includes('warm'));
  });

  it('full conversation flow', () => {
    const fsm = new ConversationFSM();
    fsm.transition('EMPATHY');
    fsm.transition('PROBLEM_DISCOVERY');
    fsm.transition('JOB_QUALIFICATION');
    fsm.transition('CONTACT_CAPTURE');
    fsm.transition('CALLBACK_SCHEDULING');
    fsm.transition('CLOSING');
    assert.equal(fsm.getState(), 'CLOSING');
    assert.equal(fsm.history.length, 7);
  });
});
