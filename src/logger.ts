import type { FastifyReply, FastifyRequest } from 'fastify'
import crypto from 'node:crypto'
import pino from 'pino'
import redactEnv from 'redact-env'
import SonicBoom from 'sonic-boom'
import type { Options } from './index'
import { randomID } from './randomID'

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
}: Options) {
  // todo: Move env redaction to a Pino v7+ Transport
  return {
    level:
      process.env.LOG_LEVEL ??
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
      req(req: FastifyRequest) {
        return {
          method: req.method,
          url: req.url,
          headers: req.headers
        }
      },
      res(res: FastifyReply) {
        return {
          statusCode: res.statusCode,
          headers: res.getHeaders()
        }
      }
    }
  }
}

export const makeReqIdGenerator = (defaultSalt: string = randomID()) =>
  function genReqId(req: FastifyRequest): string {
    let ipAddress: string = ''
    const xForwardedFor = req.headers['x-forwarded-for']
    if (xForwardedFor) {
      ipAddress =
        typeof xForwardedFor === 'string'
          ? xForwardedFor.split(',')[0]
          : xForwardedFor[0].split(',')[0]
    } else {
      ipAddress = req.socket?.remoteAddress ?? ''
    }
    const hash = crypto.createHash('sha256')
    hash.update(ipAddress)
    hash.update(req.headers['user-agent'] ?? '')
    hash.update(process.env.LOG_FINGERPRINT_SALT ?? defaultSalt)
    const fingerprint = hash.digest('base64url').slice(0, 16)
    return [fingerprint, randomID(12)].join('.')
  }
