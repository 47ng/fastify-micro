import path from 'node:path'
import { createServer, startServer } from '../../dist'

async function main() {
  const server = createServer({
    name: 'integration-test',
    printRoutes: 'console',
    routes: {
      dir: path.resolve(__dirname, './routes')
    }
  })
  await startServer(server)
}

// --

if (require.main === module) {
  main()
}
