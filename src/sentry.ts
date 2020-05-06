import { FastifyRequest, FastifyError } from 'fastify'
import fp from 'fastify-plugin'
import * as Sentry from '@sentry/node'
import { Server } from './index'

export interface SentryExtra {
  /**
   * Tags are searchable key/value pairs, useful for filtering issues/events.
   */
  tags: {
    [key: string]: string
  }
  /**
   * Context is additional data attached to an issue/event,
   * values here are not searchable.
   */
  context: {
    [key: string]: any
  }
}

export interface SentryReporter {
  report: <R extends FastifyRequest>(
    error: Error,
    req?: R,
    extra?: Partial<SentryExtra>
  ) => Promise<void>
}

export interface SentryOptions<S extends Server> extends Sentry.NodeOptions {
  getUser?: <R extends FastifyRequest>(
    server: S,
    req: R
  ) => Promise<Sentry.User>
  getExtra?: <R extends FastifyRequest>(
    server: S,
    req?: R
  ) => Promise<Partial<SentryExtra>>
}

// --

function sentryPlugin(
  server: Server,
  options: SentryOptions<Server>,
  next: (err?: FastifyError) => void
) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    release: options.release ?? process.env.SENTRY_RELEASE,
    environment: process.env.NODE_ENV,
    enabled: !!process.env.SENTRY_DSN,
    ...options
  })

  const reporter: SentryReporter = {
    async report(error, req, extra = {}) {
      let user: Sentry.User | undefined
      if (options.getUser && req) {
        try {
          user = {
            ip_address: req.ip,
            ...(await options.getUser(server, req))
          }
        } catch {}
      }
      let extraTags = extra.tags || {}
      let extraContext = extra.context || {}
      if (options.getExtra) {
        try {
          const globalExtra = await options.getExtra(server, req)
          extraTags = {
            ...extraTags,
            ...globalExtra.tags
          }
          extraContext = {
            ...extraContext,
            ...globalExtra.context
          }
        } catch {}
      }
      Sentry.withScope(scope => {
        if (user) {
          scope.setUser(user)
        }
        scope.setTags({
          path: req?.raw.url ?? 'Not available',
          ...(server.name ? { service: server.name } : {}),
          ...extraTags
        })
        scope.setExtras({
          'request ID': req?.id,
          instance: process.env.INSTANCE_ID?.slice(0, 8) ?? 'Not available',
          commit: process.env.COMMIT_ID?.slice(0, 8),
          ...extraContext
        })
        Sentry.captureException(error)
      })
    }
  }

  server.decorate('sentry', reporter)

  server.setErrorHandler(async (error, req, res) => {
    if (
      (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) ||
      error.validation
    ) {
      req.log.warn(error)
    } else {
      req.log.error(error)
    }

    if (error.validation) {
      return res.status(400).send(error)
    }
    if (error.statusCode) {
      // Error object already contains useful information
      return res.send(error)
    }

    // Report the error to Sentry
    await (server as Server).sentry.report(error, req)

    // Pass to the generic error handler (500)
    return res.send(error)
  })
  next()
}

export default fp(sentryPlugin as any)
