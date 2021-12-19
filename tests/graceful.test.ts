import { createServer, startServer } from '../src'
import { delay } from './jigs/delay'

describe('Graceful shutdown', () => {
  test('with custom handler', async () => {
    const server = createServer({ name: 'foo' })
    server.addHook('onClose', (fastify, done) => {
      expect(fastify.name).toEqual('foo')
      delay(100).then(() => done())
    })
    await startServer(server)
    await server.close()
  })

  test('with custom async handler', async () => {
    const server = createServer({ name: 'foo' })
    server.addHook('onClose', async fastify => {
      await delay(100)
      expect(fastify.name).toEqual('foo')
    })
    await startServer(server)
    await server.close()
  })
})
