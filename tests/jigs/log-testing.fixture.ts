import path from 'node:path'
import { createServer } from '../../src'

async function main() {
  process.env.SECRET = 'supersecret'
  process.env.LOG_FINGERPRINT_SALT = 'make-tests-reproducible'
  const server = createServer({
    name: 'foo',
    routesDir: path.resolve(__dirname, './routes'),
    redactEnv: ['SECRET'],
    redactLogPaths: ['secret']
  })
  await server.ready()
  await server.inject({ method: 'GET', path: '/foo?req1' })
  await server.inject({ method: 'GET', path: '/foo?req2' })
  await server.inject({
    method: 'GET',
    path: '/foo?req3',
    remoteAddress: '1.2.3.4'
  })
  await server.inject({
    method: 'GET',
    path: '/foo?req4',
    headers: {
      'user-agent': 'test that user-agent changes the reqId user fingerprint'
    }
  })
  server.log.info({ dataTestID: 'name' })
  server.log.info({ dataTestID: 'redact-env', env: process.env.SECRET })
  server.log.info({ dataTestID: 'redact-path', secret: 'secret' })
}

if (require.main === module) {
  main()
}
