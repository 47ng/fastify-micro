import * as Sentry from '@sentry/node'
import type {
  FastifyError,
  FastifyInstance,
  FastifyPluginCallback,
  FastifyRequest
} from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    sentry: SentryDecoration
  }
  interface FastifyRequest {
    sentry: SentryDecoration
  }
}

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

export type SentryReportFn = (
  error: unknown,
  extra?: Partial<SentryExtra>
) => Promise<void>

export interface SentryDecoration {
  report: SentryReportFn
}

export interface SentryOptions extends Sentry.NodeOptions {
  getUser?: <R extends FastifyRequest>(
    server: FastifyInstance,
    req: R
  ) => Promise<Sentry.User>
  getExtra?: <R extends FastifyRequest>(
    server: FastifyInstance,
    req?: R
  ) => Promise<Partial<SentryExtra>>
}

// --

function sentryPlugin(
  server: FastifyInstance,
  options: SentryOptions,
  next: (err?: FastifyError) => void
) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    release: options.release ?? process.env.SENTRY_RELEASE,
    environment: process.env.NODE_ENV,
    enabled: !!process.env.SENTRY_DSN,
    ...options
  })

  const makeDecoration = (req?: FastifyRequest): SentryDecoration => ({
    async report(error, extra = {}) {
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
  })

  server.decorate('sentry', makeDecoration())
  // https://www.fastify.io/docs/latest/Decorators/#decoraterequest
  server.decorateRequest('sentry', null)
  server.addHook('onRequest', async req => {
    req.sentry = makeDecoration(req)
  })

  server.setErrorHandler(async (error, req, res) => {
    if (
      (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) ||
      error.validation
    ) {
      req.log.warn({ err: error })
    } else {
      req.log.error({ err: error })
    }

    if (error.validation) {
      return res.status(400).send(error)
    }
    if (error.statusCode) {
      // Error object already contains useful information
      return res.send(error)
    }

    // Report the error to Sentry
    await req.sentry.report(error)

    // Pass to the generic error handler (500)
    return res.send(error)
  })
  next()
}

export default fp(sentryPlugin as FastifyPluginCallback<SentryOptions>, {
  fastify: '4.x',
  name: 'fastify-micro:sentry'
})
