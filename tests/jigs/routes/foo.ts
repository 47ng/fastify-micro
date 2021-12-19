import type { FastifyInstance } from 'fastify'

export default async (app: FastifyInstance) => {
  app.get('/foo', async () => {
    return { foo: 'bar' }
  })
}
