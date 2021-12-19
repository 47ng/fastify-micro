import type { FastifyInstance } from 'fastify'

export default async (fastify: FastifyInstance) => {
  fastify.get('/routes-loaded-ok', async (req, res) => {
    res.send(req.headers)
  })
}
