import { FastifyRequest, FastifyError } from 'fastify'
import fp from 'fastify-plugin'
import * as Sentry from '@sentry/node'
import { Server } from './index'

export interface SentryReporter {
  report: <R extends FastifyRequest>(
    error: Error,
    req?: R,
    extra?: { [key: string]: any }
  ) => Promise<void>
}

export interface SentryOptions<S extends Server> {
  release?: string
  getUser?: <R extends FastifyRequest>(
    server: S,
    req: R
  ) => Promise<Sentry.User>
  getExtras?: <R extends FastifyRequest>(
    server: S,
    req?: R
  ) => Promise<{ [key: string]: any }>
}

// --

export function getSentryReleaseName(server: Server) {
  const date = new Date().toISOString().slice(0, 10)
  const commit = process.env.COMMIT_ID
  const name = server.name
  return [date, commit, name].filter(x => !!x).join('.')
}

// --

function sentryPlugin(
  server: Server,
  options: SentryOptions<Server> = {},
  next: (err?: FastifyError) => void
) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    release:
      options.release ??
      process.env.SENTRY_RELEASE ??
      getSentryReleaseName(server),
    environment: process.env.NODE_ENV,
    enabled: !!process.env.SENTRY_DSN
  })

  const reporter: SentryReporter = {
    async report(error, req, extra = {}) {
      let user: Sentry.User = {
        ip_address: req?.ip
      }
      if (options.getUser && req) {
        try {
          user = {
            ...user,
            ...(await options.getUser(server, req))
          }
        } catch {}
      }
      let extras = extra
      if (options.getExtras) {
        try {
          extras = {
            ...extra,
            ...(await options.getExtras(server, req))
          }
        } catch {}
      }

      Sentry.withScope(scope => {
        if (user) {
          scope.setUser(user)
        }
        scope.setTags({
          path: req?.raw.url ?? 'Not available',
          ...(server.name ? { service: server.name } : {})
        })
        scope.setExtras({
          'request ID': req?.id,
          instance: process.env.INSTANCE_ID?.slice(0, 8) ?? 'Not available',
          commit: process.env.COMMIT_ID?.slice(0, 8),
          ...extras
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
