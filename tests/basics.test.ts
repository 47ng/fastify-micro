import axios from 'axios'
import { createServer, startServer } from '../src'
import { randomID } from '../src/randomID'

describe('Basics', () => {
  beforeEach(() => {
    process.env.LOG_LEVEL = 'silent'
  })

  test('The specified `name` property is injected', () => {
    const unnamedServer = createServer()
    expect(unnamedServer.name).toBeUndefined()
    const namedServer = createServer({ name: 'foo' })
    expect(namedServer.name).toBe('foo')
  })

  test('Default port should be 3000', async () => {
    const key = randomID()
    const server = createServer()
    server.get('/', (_, res) => {
      res.send({ key })
    })
    await startServer(server)
    const res = await axios.get('http://localhost:3000/')
    expect(res.data.key).toEqual(key)
    await server.close()
  })

  test('Port should be configurable via the environment', async () => {
    process.env.PORT = '3001'
    const key = randomID()
    const server = createServer()
    server.get('/', (_, res) => {
      res.send({ key })
    })
    await startServer(server)
    const res = await axios.get('http://localhost:3001/')
    expect(res.data.key).toEqual(key)
    await server.close()
    process.env.PORT = undefined
  })

  test('Port can be passed as a second argument to `startServer`', async () => {
    const server = createServer()
    const key = randomID()
    server.get('/', (_, res) => {
      res.send({ key })
    })
    await startServer(server, 3002)
    const res = await axios.get('http://localhost:3002/')
    expect(res.data.key).toEqual(key)
    await server.close()
  })
})
