import axios from 'axios'
import { nanoid } from 'nanoid'
import path from 'path'
import { createServer, startServer } from '../src'
import { delay } from './jigs/delay'

describe('Plugins', () => {
  beforeEach(() => {
    process.env.LOG_LEVEL = 'silent'
  })

  test('Loading routes from filesystem', async () => {
    const routesDir = path.resolve(path.dirname(__filename), './jigs/routes')
    const server = createServer({ routesDir })
    await server.ready()
    const res = await server.inject({ method: 'GET', url: '/foo' })
    expect(res.statusCode).toEqual(200)
    expect(res.json()).toEqual({ foo: 'bar' })
  })

  test('Graceful exit', async () => {
    //jest.setTimeout(10000)
    const key = nanoid()
    const server = createServer()
    server.get('/', async (_, res) => {
      await delay(1000)
      res.send({ key })
    })
    await startServer(server)
    const resBeforeP = axios.get('http://localhost:3000/')
    await delay(100) // Give time to the request to start before shutting down the server
    await server.close()
    const resBefore = await resBeforeP
    expect(resBefore.data.key).toEqual(key)
  })

  test('Graceful exit with a slow onClose hook', async () => {
    const key = nanoid()
    const server = createServer()
    server.get('/', async (_, res) => {
      await delay(1000)
      res.send({ key })
    })
    server.addHook('onClose', async (_, done) => {
      await delay(3000) // Simulate slow shutdown of backing services
      done()
    })
    await startServer(server)
    const resBeforeP = axios.get('http://localhost:3000/')
    await delay(100) // Give time to the request to start before shutting down the server
    await server.close()
    const resBefore = await resBeforeP
    expect(resBefore.data.key).toEqual(key)
  })
})
