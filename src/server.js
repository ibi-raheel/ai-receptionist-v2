import Fastify from 'fastify';
import fastifyFormBody from '@fastify/formbody';
import fastifyWebSocket from '@fastify/websocket';
import { config } from './config.js';
import { twilioRoutes } from './routes/twilio.js';
import { healthRoutes } from './routes/health.js';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
});

await fastify.register(fastifyFormBody);
await fastify.register(fastifyWebSocket);
await fastify.register(healthRoutes);
await fastify.register(twilioRoutes);

try {
  await fastify.listen({ port: config.port, host: '0.0.0.0' });
} catch (err) {
  fastify.log.error(err, 'Failed to start server');
  process.exit(1);
}
