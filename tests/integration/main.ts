import fs from 'node:fs/promises'
import path from 'node:path'
import { createServer, startServer } from '../../dist'

async function main() {
  const server = createServer({
    name: 'integration-test',
    printRoutes: 'console',
    routes: {
      dir: path.resolve(__dirname, './routes')
    },
    https: {
      cert: await fs.readFile(
        path.resolve(__dirname, '../../certs/fastify-micro.localhost.pem')
      ),
      key: await fs.readFile(
        path.resolve(__dirname, '../../certs/fastify-micro.localhost-key.pem')
      )
    }
  })
  await startServer(server)
}

// --

if (require.main === module) {
  main()
}
