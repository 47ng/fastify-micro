import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    testPlugin: string
  }
}

export default fp(async (app: FastifyInstance) => {
  app.decorate('testPlugin', 'works')
})
