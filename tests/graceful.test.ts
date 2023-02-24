import { setTimeout } from 'node:timers/promises'
import { createServer, startServer } from '../src'

describe('Graceful shutdown', () => {
  test('with custom handler', async () => {
    const server = createServer({ name: 'foo' })
    server.addHook('onClose', (fastify, done) => {
      expect(fastify.name).toEqual('foo')
      setTimeout(100).then(() => done())
    })
    await startServer(server)
    await server.close()
  })

  test('with custom async handler', async () => {
    const server = createServer({ name: 'foo' })
    server.addHook('onClose', async fastify => {
      await setTimeout(100)
      expect(fastify.name).toEqual('foo')
    })
    await startServer(server)
    await server.close()
  })
})
