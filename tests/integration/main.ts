const path = require('node:path')
const { createServer, startServer } = require('../../dist')

async function main() {
  const server = createServer({
    name: 'integration-test',
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
