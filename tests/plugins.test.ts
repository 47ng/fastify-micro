import axios from 'axios'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { createServer, startServer } from '../src'
import { randomID } from '../src/randomID'
import './jigs/plugins/decorator' // for declaration merging

describe('Plugins', () => {
  beforeEach(() => {
    process.env.LOG_LEVEL = 'silent'
  })

  test('Loading plugins & routes from filesystem', async () => {
    const server = createServer({
      plugins: {
        dir: path.resolve(__dirname, './jigs/plugins')
      },
      routes: {
        dir: path.resolve(__dirname, './jigs/routes')
      }
    })
    await server.ready()
    expect(server.testPlugin).toEqual('works')
    const res = await server.inject({ method: 'GET', url: '/foo' })
    expect(res.statusCode).toEqual(200)
    expect(res.json()).toEqual({ foo: 'bar' })
  })

  test('Graceful exit', async () => {
    //jest.setTimeout(10000)
    const key = randomID()
    const server = createServer()
    server.get('/', async (_, res) => {
      await setTimeout(1000)
      res.send({ key })
    })
    await startServer(server)
    const resBeforeP = axios.get('http://localhost:3000/')
    await setTimeout(100) // Give time to the request to start before shutting down the server
    await server.close()
    const resBefore = await resBeforeP
    expect(resBefore.data.key).toEqual(key)
  })

  test('Graceful exit with a slow onClose hook', async () => {
    const key = randomID()
    const server = createServer()
    server.get('/', async (_, res) => {
      await setTimeout(1000)
      res.send({ key })
    })
    server.addHook('onClose', async (_, done) => {
      await setTimeout(3000) // Simulate slow shutdown of backing services
      done()
    })
    await startServer(server)
    const resBeforeP = axios.get('http://localhost:3000/')
    await setTimeout(100) // Give time to the request to start before shutting down the server
    await server.close()
    const resBefore = await resBeforeP
    expect(resBefore.data.key).toEqual(key)
  })
})
