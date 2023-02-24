import axios from 'axios'
import fs from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer, startServer } from '../src'
import { randomID } from '../src/randomID'

describe('HTTPS', () => {
  beforeEach(() => {
    process.env.LOG_LEVEL = 'silent'
  })

  test('Passing TLS options', async () => {
    const key = randomID()
    const server = createServer({
      https: {
        cert: await fs.readFile(
          resolve(__dirname, '../certs/fastify-micro.localhost.pem')
        ),
        key: await fs.readFile(
          resolve(__dirname, '../certs/fastify-micro.localhost-key.pem')
        )
      }
    })
    server.get('/', (_, res) => {
      res.send({ key })
    })
    await startServer(server, 3000)
    const res = await axios.get('https://localhost:3000')
    expect(res.data.key).toEqual(key)
    await server.close()
  })
})
