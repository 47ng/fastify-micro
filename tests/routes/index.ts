import type { FastifyInstance } from 'fastify'

export default async (app: FastifyInstance) => {
  app.get('/foo', (_req, res) => {
    res.send({ foo: 'bar' })
  })
}
