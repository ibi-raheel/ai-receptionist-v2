import OpenAI from 'openai';
import { EventEmitter } from 'events';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { buildSystemPrompt } from '../prompts/dispatcher.js';
import { TOOLS_FOR_OPENAI } from '../tools/function-defs.js';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export class LLMEngine extends EventEmitter {
  constructor({ conversationFSM, emotionEngine }) {
    super();
    this.fsm = conversationFSM;
    this.emotionEngine = emotionEngine;
    this.messages = [];
    this.abortController = null;
  }

  /**
   * Generate a response for the given user transcript.
   * Streams tokens via 'token' events.
   * Emits 'done' when complete, 'function_call' for tool calls.
   */
  async generateResponse(userTranscript) {
    // Build dynamic system prompt with state + emotion context
    const systemPrompt = buildSystemPrompt({
      companyName: config.business.name,
      city: config.business.city,
      stateContext: this.fsm.getPromptContext(),
      emotionContext: this.emotionEngine.getContextForPrompt(),
    });

    // Add user message to history
    this.messages.push({ role: 'user', content: userTranscript });

    this.abortController = new AbortController();

    try {
      const stream = await openai.chat.completions.create(
        {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            ...this.messages,
          ],
          tools: TOOLS_FOR_OPENAI,
          temperature: 0.9,
          max_tokens: 200,
          stream: true,
        },
        { signal: this.abortController.signal }
      );

      let fullResponse = '';
      let functionCallName = null;
      let functionCallArgs = '';
      let functionCallId = null;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        // Handle text content
        if (delta.content) {
          fullResponse += delta.content;
          this.emit('token', delta.content);
        }

        // Handle function/tool calls
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.function?.name) {
              functionCallName = tc.function.name;
              functionCallId = tc.id;
            }
            if (tc.function?.arguments) {
              functionCallArgs += tc.function.arguments;
            }
          }
        }
      }

      // Handle function call if present
      if (functionCallName) {
        logger.info({ name: functionCallName }, 'LLM function call');
        let args;
        try {
          args = JSON.parse(functionCallArgs);
        } catch {
          args = {};
        }

        // Add assistant message with tool call to history
        this.messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: functionCallId,
            type: 'function',
            function: { name: functionCallName, arguments: functionCallArgs },
          }],
        });

        this.emit('function_call', {
          id: functionCallId,
          name: functionCallName,
          arguments: args,
        });
      } else if (fullResponse) {
        // Add assistant text response to history
        this.messages.push({ role: 'assistant', content: fullResponse });
      }

      this.emit('done', fullResponse);
    } catch (err) {
      if (err.name === 'AbortError') {
        logger.debug('LLM generation cancelled');
        return;
      }
      logger.error({ err: err.message }, 'LLM generation error');
      this.emit('error', err);
    }
  }

  /**
   * Add a function/tool result to the conversation and generate follow-up.
   */
  async addFunctionResult(toolCallId, result) {
    this.messages.push({
      role: 'tool',
      tool_call_id: toolCallId,
      content: typeof result === 'string' ? result : JSON.stringify(result),
    });

    // Generate follow-up response after function call
    await this.generateResponse_internal();
  }

  /**
   * Generate a response without adding a user message (used after tool results).
   */
  async generateResponse_internal() {
    const systemPrompt = buildSystemPrompt({
      companyName: config.business.name,
      city: config.business.city,
      stateContext: this.fsm.getPromptContext(),
      emotionContext: this.emotionEngine.getContextForPrompt(),
    });

    this.abortController = new AbortController();

    try {
      const stream = await openai.chat.completions.create(
        {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            ...this.messages,
          ],
          tools: TOOLS_FOR_OPENAI,
          temperature: 0.9,
          max_tokens: 200,
          stream: true,
        },
        { signal: this.abortController.signal }
      );

      let fullResponse = '';
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullResponse += delta.content;
          this.emit('token', delta.content);
        }
      }

      if (fullResponse) {
        this.messages.push({ role: 'assistant', content: fullResponse });
      }
      this.emit('done', fullResponse);
    } catch (err) {
      if (err.name === 'AbortError') return;
      logger.error({ err: err.message }, 'LLM follow-up error');
      this.emit('error', err);
    }
  }

  /**
   * Generate the initial greeting (no user input yet).
   */
  async generateGreeting() {
    await this.generateResponse('[SYSTEM: The caller just picked up the phone. Greet them warmly.]');
  }

  /**
   * Cancel the current generation.
   */
  cancel() {
    this.abortController?.abort();
  }
}
