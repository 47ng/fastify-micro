import checkEnv from '@47ng/check-env'
import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify'
import { AutoloadPluginOptions, fastifyAutoload } from 'fastify-autoload'
import 'fastify-sensible'
import sensible from 'fastify-sensible'
import underPressurePlugin from 'under-pressure'
import gracefulShutdown, { GracefulShutdownOptions } from './graceful-shutdown'
import { getLoggerOptions, makeReqIdGenerator } from './logger'
import sentry, { SentryOptions } from './sentry'

declare module 'fastify' {
  interface FastifyInstance {
    name?: string
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
   * To redact sensitive information, supply paths to log keys that hold sensitive data.
   *
   * The following headers are already redacted for security:
   * - req.headers["x-secret-token"]
   * - req.headers["x-csrf-token"]
   * - req.headers.cookie
   * - req.headers.authorization
   * - res.headers["set-cookie"]
   *
   * See https://getpino.io/#/docs/redaction.
   */
  redactLogPaths?: string[]

  /**
   * @deprecated - Use `plugins` instead to load plugins from the filesystem.
   *
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
   * Add custom options for graceful shutdown
   */
  gracefulShutdown?: GracefulShutdownOptions | false

  /**
   * Add custom options for Sentry
   *
   * To enable Sentry, set the SENTRY_DSN environment variable to the
   * DSN (found in your project settings).
   */
  sentry?: SentryOptions

  /**
   * Load plugins from the filesystem with `fastify-autoload`.
   *
   * Plugins are loaded before routes (see `routes` option).
   */
  plugins?: AutoloadPluginOptions

  /**
   * Load routes from the filesystem with `fastify-autoload`.
   *
   * Routes are loaded after plugins (see `plugins` option).
   */
  routes?: AutoloadPluginOptions

  /**
   * @deprecated - Use `routes` instead, with full `fastify-autoload` options.
   *
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
   * Run cleanup tasks before exiting.
   *
   * Eg: disconnecting backing services, closing files...
   */
  cleanupOnExit?: (server: FastifyInstance) => Promise<void>

  /**
   * Print routes after server has loaded
   *
   * By default, loaded routes are only printed in the console in
   * development, for debugging purposes.
   * You can use the following values:
   * - `auto` (default): `console` in development, silent in production.
   * - `console`: always pretty-print routes using `console.info` (for humans)
   * - `logger`: always print as NDJSON as part of the app log stream (info level)
   * - false: disable route printing
   */
  printRoutes?: 'auto' | 'console' | 'logger' | false
}

export function createServer(
  options: Options = {
    printRoutes: 'auto',
    routesDir: false
  }
) {
  checkEnv({ required: ['NODE_ENV'] })

  const server = Fastify({
    logger: getLoggerOptions(options),
    genReqId: makeReqIdGenerator(),
    trustProxy: process.env.TRUSTED_PROXY_IPS,
    ...options
  })
  if (options.name) {
    server.decorate('name', options.name)
  }

  server.register(sensible)
  server.register(sentry, options.sentry as any)

  try {
    if (options.plugins) {
      server.register(fastifyAutoload, options.plugins)
    }
    if (options.configure) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          '[fastify-micro] Option `configure` is deprecated. Use `plugins` instead with full fastify-autoload options.'
        )
      }
      options.configure(server)
    }

    const afterPlugins = server.after(error => {
      if (error) {
        throw error
      }
    })

    // Registered after plugins to let the health check callback
    // monitor external services' health.
    if (
      process.env.FASTIFY_MICRO_DISABLE_SERVICE_HEALTH_MONITORING !== 'true'
    ) {
      const underPressureOptions = options.underPressure || {}
      afterPlugins.register(underPressurePlugin, {
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

    if (options.gracefulShutdown !== false) {
      afterPlugins.register(async fastify => {
        fastify.register(
          gracefulShutdown,
          options.gracefulShutdown as GracefulShutdownOptions | undefined
        )
      })
    }

    if (options.routes) {
      server.register(fastifyAutoload, options.routes)
    }
    if (options.routesDir) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          '[fastify-micro] Option `routesDir` is deprecated. Use `routes` instead with full fastify-autoload options.'
        )
      }
      server.register(fastifyAutoload, {
        dir: options.routesDir
      })
    }

    if (options.cleanupOnExit) {
      server.addHook('onClose', options.cleanupOnExit)
    }

    server.ready(error => {
      if (error) {
        // This will let the server crash early
        // on plugin/routes loading errors.
        throw error
      }
      if (options.printRoutes === false) {
        return
      }
      const printRoutesOptions = {
        commonPrefix: false, // flatten the tree
        includeHooks: true
      }
      switch (options.printRoutes || 'auto') {
        default:
        case 'auto':
          if (process.env.NODE_ENV === 'development') {
            console.info(server.printRoutes(printRoutesOptions))
          }
          break
        case 'console':
          console.info(server.printRoutes(printRoutesOptions))
          break
        case 'logger':
          server.log.info({
            msg: 'Routes loaded',
            routes: server.printRoutes(printRoutesOptions)
          })
          break
      }
    })
  } catch (error) {
    server.log.fatal(error)
    if (!server.sentry) {
      process.exit(1)
    }
    server.sentry
      .report(error as any)
      .catch(error => server.log.fatal(error))
      .finally(() => process.exit(1))
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
  await server.ready().then(
    () => {
      server.log.debug('Starting server')
    },
    error => {
      if (error) {
        throw error
      }
    }
  )
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
