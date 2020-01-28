import checkEnv from '@47ng/check-env'
import Fastify, { FastifyInstance, ServerOptions } from 'fastify'
import autoLoad from 'fastify-autoload'
import sensible from 'fastify-sensible'
import gracefulShutdown from 'fastify-graceful-shutdown'
import underPressurePlugin, { UnderPressureOptions } from 'under-pressure'
import { getLoggerOptions, makeReqIdGenerator } from './logger'
import sentry, { SentryReporter, SentryOptions } from './sentry'

export type Server = FastifyInstance & {
  name?: string
  sentry: SentryReporter
}

export type Options<S extends Server> = ServerOptions & {
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
  configure?: (server: S) => void

  /**
   * Add custom options for under-pressure
   */
  underPressure?: Omit<UnderPressureOptions, 'healthCheck'> & {
    healthCheck: (server: S) => Promise<boolean>
  }

  /**
   * Add custom options for Sentry
   *
   * To enable Sentry, set the SENTRY_DSN environment variable to the
   * DSN (found in your project settings).
   */
  sentry?: SentryOptions<S>

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
}

export function createServer<S extends Server>(
  options: Options<S> = {
    routesDir: false
  }
): S {
  checkEnv({ required: ['NODE_ENV'] })

  const server = Fastify({
    logger: getLoggerOptions(options.name, options.redactEnv),
    // todo: Fix type when switching to Fastify 3.x
    genReqId: makeReqIdGenerator() as any,
    trustProxy: process.env.TRUSTED_PROXY_IPS,
    ...options
  }) as S
  if (options.name) {
    server.decorate('name', options.name)
  }

  server.register(sensible)
  server.register(sentry, options.sentry)

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
      dir: options.routesDir,
      includeTypeScript: true
    })
  }

  const { healthCheck, ...underPressureOptions } = options.underPressure || {}
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
    healthCheck: async () => {
      if (healthCheck) {
        return await healthCheck(server)
      }
      return true
    },
    ...underPressureOptions
  })

  if (process.env.NODE_ENV === 'development') {
    server.ready(() => console.info(server.printRoutes()))
  }

  return server
}

export async function startServer<S extends Server>(server: S, port: number) {
  await new Promise(resolve => {
    server.listen({ port, host: '0.0.0.0' }, (error, address) => {
      if (error) {
        server.log.fatal({ msg: `Application startup error`, error, address })
        process.exit(1)
      } else {
        resolve()
      }
    })
  })
  return await server.ready()
}
