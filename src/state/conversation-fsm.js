import { logger } from '../utils/logger.js';

const STATES = {
  GREETING: {
    prompt: 'Greet the caller warmly. Ask what\'s going on.',
    next: ['PROBLEM_DISCOVERY'],
  },
  PROBLEM_DISCOVERY: {
    prompt: 'Figure out what happened. Ask ONE question at a time.',
    next: ['JOB_QUALIFICATION', 'CONTACT_CAPTURE'],
  },
  JOB_QUALIFICATION: {
    prompt: 'Get job details: insurance, property type, area affected, flooring. ONE question at a time.',
    next: ['CONTACT_CAPTURE'],
  },
  CONTACT_CAPTURE: {
    prompt: 'Get name, phone, and address. Call capture_lead when you have them.',
    next: ['CLOSING'],
  },
  CLOSING: {
    prompt: 'Wrap up: crew dispatched, callback in 15 min. Say goodbye warmly.',
    next: [],
  },
};

export class ConversationFSM {
  constructor() {
    this.currentState = 'GREETING';
    this.history = ['GREETING'];
  }

  /**
   * Attempt to transition to a new state.
   * Returns true if transition was valid, false otherwise.
   */
  transition(newState) {
    if (!STATES[newState]) {
      logger.warn({ newState }, 'Invalid state');
      return false;
    }

    const allowed = STATES[this.currentState].next;
    // Allow staying in the same state (LLM may need multiple turns)
    if (newState === this.currentState) return true;

    if (allowed.includes(newState)) {
      logger.info({ from: this.currentState, to: newState }, 'State transition');
      this.currentState = newState;
      this.history.push(newState);
      return true;
    }

    // Allow skipping forward (LLM may combine steps)
    logger.info({ from: this.currentState, to: newState }, 'State skip-forward');
    this.currentState = newState;
    this.history.push(newState);
    return true;
  }

  /**
   * Get the current state's prompt context.
   */
  getPromptContext() {
    const state = STATES[this.currentState];
    return `Current conversation stage: ${this.currentState}. ${state.prompt}`;
  }

  getState() {
    return this.currentState;
  }
}
