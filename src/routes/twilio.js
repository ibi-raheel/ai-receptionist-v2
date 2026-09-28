import { handleCall } from '../services/call-handler.js';
import { logger } from '../utils/logger.js';

export async function twilioRoutes(fastify) {
  fastify.post('/incoming-call', async (request, reply) => {
    const host = request.headers.host;
    logger.info({ from: request.body?.From, to: request.body?.To }, 'Incoming call');

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${host}/media-stream" />
  </Connect>
</Response>`;

    reply.type('text/xml').send(twiml);
  });

  fastify.get('/media-stream', { websocket: true }, (socket, request) => {
    logger.info('Twilio media stream connected');
    handleCall(socket);
  });
}
