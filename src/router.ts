import walkdir from 'walkdir'
import { Logger } from 'pino'
import { Server } from './index'

export default function loadRoutesFromFileSystem<S extends Server>(
  server: S,
  path: string
) {
  const logger = (server.log as Logger).child({
    plugin: 'fastify-micro:router'
  })
  const files = walkdir.sync(path)
  logger.trace({
    msg: 'Loading routes',
    files
  })
  files.forEach(file => {
    try {
      server.register(require(file).default)
      logger.trace({
        message: 'Loaded route file',
        path: file
      })
    } catch (error) {
      logger.error({
        msg: 'Failed to load route file',
        path: file
      })
    }
  })
}
