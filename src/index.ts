import checkEnv from '@47ng/check-env'
import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify'
import autoLoad from 'fastify-autoload'
// @ts-ignore
import gracefulShutdown from 'fastify-graceful-shutdown'
import 'fastify-sensible'
import sensible from 'fastify-sensible'
import underPressurePlugin from 'under-pressure'
import { getLoggerOptions, makeReqIdGenerator } from './logger'
import sentry, { SentryDecoration, SentryOptions } from './sentry'

declare module 'fastify' {
  interface FastifyInstance {
    name?: string
    sentry: SentryDecoration
  }
}

export type Options = FastifyServerOptions & {
  /**
   * The name of your service.
   *
   * It will show in the logs under the "from" key.
   */
  name?: string

  /**
   * A list of environment variable names, whose values will be redacted in the logs.
   *
   * The following internal env var names will be added:
   * - SENTRY_DSN
   */
  redactEnv?: string[]

  /**
   * Add your own plugins in this callback.
   *
   * It's called after most built-in plugins have run,
   * but before loading your routes (if enabled with routesDir).
   *
   * This is where we recommend registering interfaces
   * to your service's data stores.
   */
  configure?: (server: FastifyInstance) => void

  /**
   * Add custom options for under-pressure
   */
  underPressure?: underPressurePlugin.UnderPressureOptions

  /**
   * Add custom options for Sentry
   *
   * To enable Sentry, set the SENTRY_DSN environment variable to the
   * DSN (found in your project settings).
   */
  sentry?: SentryOptions

  /**
   * Path to a directory where to load routes.
   *
   * This directory will be walked recursively and any file encountered
   * will be registered as a fastify plugin.
   * Routes are loaded after `configure` has run (if specified).
   *
   * Pass `false` to disable (it is disabled by default).
   */
  routesDir?: string | false

  /**
   * Print routes after server has loaded
   *
   * By default, loaded routes are only printed in the console in
   * development, for debugging purposes.
   * You can use the following values:
   * - `auto` (default): `console` in development, silent in production.
   * - `console`: always pretty-print routes using `console.info` (for humans)
   * - `logger`: always print as NDJSON as part of the app log stream (info level)
   * - false: disable route logging
   */
  printRoutes?: 'auto' | 'console' | 'logger' | false
}

export function createServer(
  options: Options = {
    routesDir: false,
    printRoutes: 'auto'
  }
) {
  checkEnv({ required: ['NODE_ENV'] })

  const server = Fastify({
    logger: getLoggerOptions(options.name, options.redactEnv),
    // todo: Fix type when switching to Fastify 3.x
    genReqId: makeReqIdGenerator() as any,
    trustProxy: process.env.TRUSTED_PROXY_IPS,
    ...options
  })
  if (options.name) {
    server.decorate('name', options.name)
  }

  server.register(sensible)
  server.register(sentry, options.sentry as any)

  // Disable graceful shutdown if signal listeners are already in use
  // (eg: using Clinic.js or other kinds of wrapping utilities)
  const gracefulSignals = ['SIGINT', 'SIGTERM'].filter(
    signal => process.listenerCount(signal) > 0
  )
  if (gracefulSignals.length === 0) {
    server.register(gracefulShutdown)
  } else if (process.env.NODE_ENV === 'production') {
    server.log.warn({
      plugin: 'fastify-graceful-shutdown',
      msg: 'Automatic graceful shutdown is disabled',
      reason: 'Some signal handlers were already registered',
      signals: gracefulSignals
    })
  }

  if (options.configure) {
    options.configure(server)
  }

  if (options.routesDir) {
    server.register(autoLoad, {
      dir: options.routesDir
    })
  }

  if (process.env.FASTIFY_MICRO_DISABLE_SERVICE_HEALTH_MONITORING !== 'true') {
    const underPressureOptions = options.underPressure || {}
    server.register(underPressurePlugin, {
      maxEventLoopDelay: 1000, // 1s
      // maxHeapUsedBytes: 100 * (1 << 20), // 100 MiB
      // maxRssBytes: 100 * (1 << 20), // 100 MiB
      healthCheckInterval: 5000, // 5 seconds
      exposeStatusRoute: {
        url: '/_health',
        routeOpts: {
          logLevel: 'warn'
        }
      },
      ...underPressureOptions
    })
  }

  if (options.printRoutes !== false) {
    switch (options.printRoutes || 'auto') {
      default:
      case 'auto':
        if (process.env.NODE_ENV === 'development') {
          server.ready(() => console.info(server.printRoutes()))
        }
        break
      case 'console':
        server.ready(() => console.info(server.printRoutes()))
        break
      case 'logger':
        server.ready(() =>
          server.log.info({
            msg: 'Routes loaded',
            routes: server.printRoutes()
          })
        )
        break
    }
  }

  return server
}

/**
 * Wait for the server to be ready and start listening.
 *
 * The server is ready when all async plugins have finished loading.
 *
 * @param server - An instance of Fastify
 * @param port - Optional, the port to listen to.
 *               Defaults to the value of the PORT environment variable,
 *               or 3000 if not specified in the environment either.
 */
export async function startServer(
  server: FastifyInstance,
  port: number = parseInt(process.env.PORT || '3000') || 3000
) {
  await server.ready()
  return await new Promise(resolve => {
    server.listen({ port, host: '0.0.0.0' }, (error, address) => {
      if (error) {
        server.log.fatal({ msg: `Application startup error`, error, address })
        process.exit(1)
      } else {
        resolve(server)
      }
    })
  })
}
