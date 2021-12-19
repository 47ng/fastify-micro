// Based on `fastify-graceful-shutdown`, with some tweaks:
// - allow external signal handlers to be registered
// - don't use specific handlers, use Fastify's `onClose` hooks.
// - await async onClose hooks
// - add some options

import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

export interface GracefulShutdownOptions {
  /**
   * A list of signals to listen to and trigger
   * a graceful shutdown when received.
   *
   * Defaults to `["SIGINT", "SIGTERM"]`.
   */
  signals?: string[]

  /**
   * How long to wait (in ms) for the signal handlers
   * to resolve before doing a hard exit to kill
   * the process with `process.exit()`
   *
   * Defaults to 10 seconds.
   */
  timeoutMs?: number

  /**
   * The exit code to use when hard-exiting after
   * the timeout has expired.
   *
   * Defaults to 1.
   */
  hardExitCode?: number
}

export const defaultGracefulShutdownOptions: Required<GracefulShutdownOptions> =
  {
    signals: ['SIGINT', 'SIGTERM'],
    timeoutMs: 10_000,
    hardExitCode: 1
  }

const gracefulShutdownPlugin: FastifyPluginAsync<GracefulShutdownOptions> =
  async function gracefulShutdownPlugin(fastify, userOptions = {}) {
    const logger = fastify.log.child({
      plugin: 'fastify-micro:graceful-shutdown'
    })

    const options = {
      ...defaultGracefulShutdownOptions,
      ...userOptions
    }

    options.signals.forEach(signal => {
      process.once(signal, () => {
        logger.info({ signal }, 'Received signal')
        const timeout = setTimeout(() => {
          logger.fatal({ signal }, 'Hard-exiting the process after timeout')
          process.exit(options.hardExitCode)
        }, options.timeoutMs)
        fastify.close().then(
          () => {
            clearTimeout(timeout)
            logger.info({ signal }, 'Process terminated')
            process.exit(0)
          },
          error => {
            logger.error(
              { signal, error },
              'Process terminated with error on `onClose` hook'
            )
            process.exit(1)
          }
        )
      })
    })
  }

export default fp(gracefulShutdownPlugin, {
  fastify: '3.x',
  name: 'fastify-micro:graceful-shutdown'
})
