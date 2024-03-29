import type { FastifyLoggerOptions, FastifyRequest } from 'fastify'
import { nanoid } from 'nanoid'
import crypto from 'node:crypto'
import pino from 'pino'
import redactEnv from 'redact-env'
import SonicBoom from 'sonic-boom'
import type { Options } from './index'

function createRedactedStream(
  pipeTo: SonicBoom,
  secureEnv: string[]
): SonicBoom {
  const secrets = redactEnv.build(secureEnv, process.env)
  return Object.assign({}, pipeTo, {
    write: function writeRedacted(string: string) {
      const safeString = redactEnv.redact(string, secrets, '[secure]')
      return pipeTo.write(safeString)
    }
  })
}

export function getLoggerOptions({
  name,
  redactEnv = [],
  redactLogPaths = []
}: Options): FastifyLoggerOptions & pino.LoggerOptions & { stream: any } {
  return {
    level:
      process.env.LOG_LEVEL ||
      (process.env.DEBUG === 'true' ? 'debug' : 'info'),
    redact: [
      // Security redactions
      'req.headers["x-secret-token"]',
      'req.headers["x-csrf-token"]',
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      ...redactLogPaths
    ],
    stream: createRedactedStream(pino.destination(1), [
      'SENTRY_DSN',
      ...redactEnv
    ]),
    base: {
      from: name,
      instance: process.env.INSTANCE_ID?.slice(0, 8),
      commit: process.env.COMMIT_ID?.slice(0, 8)
    },
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: req.url,
          headers: req.headers
        }
      },
      res(res) {
        // Response has already be sent at time of logging,
        // so we need to parse the headers to log them.
        // Trying to collect them earlier to show them here
        // is flaky and tightly couples things, moreover these
        // are the source of truth for what was sent to the user,
        // and includes framework-managed headers such as content-length.
        const headers = (((res as any)._header || '') as string)
          .split('\r\n')
          .slice(1) // Remove HTTP/1.1 {statusCode} {statusText}
          .reduce((obj, header: string) => {
            try {
              const [name, ...rest] = header.split(': ')
              if (['', 'date', 'connection'].includes(name.toLowerCase())) {
                return obj // Ignore those
              }
              const value =
                name === 'content-length'
                  ? parseInt(rest[0], 10)
                  : rest.join(': ')
              return {
                ...obj,
                [name]: value
              }
            } catch {
              return obj
            }
          }, {})
        return {
          statusCode: res.statusCode,
          headers
        }
      }
    }
  }
}

export const makeReqIdGenerator = (defaultSalt: string = nanoid()) =>
  function genReqId(req: FastifyRequest): string {
    let ipAddress: string = ''
    const xForwardedFor = req.headers['x-forwarded-for']
    if (xForwardedFor) {
      ipAddress =
        typeof xForwardedFor === 'string'
          ? xForwardedFor.split(',')[0]
          : xForwardedFor[0].split(',')[0]
    } else {
      ipAddress = req.socket?.remoteAddress || ''
    }
    const hash = crypto.createHash('sha256')
    hash.update(ipAddress)
    hash.update(req.headers['user-agent'] || '')
    hash.update(process.env.LOG_FINGERPRINT_SALT || defaultSalt)
    const fingerprint = hash
      .digest('base64')
      .slice(0, 16)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')

    return [fingerprint, nanoid(16)].join('.')
  }
