export async function healthRoutes(fastify) {
  fastify.get('/health', async () => ({ status: 'ok', version: 'v2' }));
}
