import { createServer } from '../src'

describe('Health checks', () => {
  beforeEach(() => {
    process.env.LOG_LEVEL = 'silent'
  })

  test('Default configuration exposes a /_health route', async () => {
    const server = createServer()
    await server.ready()
    const res = await server.inject({ method: 'GET', url: '/_health' })
    expect(res.statusCode).toEqual(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })

  test('Custom health check handler is called at startup and every 5 seconds', async () => {
    jest.useFakeTimers('legacy')
    const healthCheck = jest.fn().mockResolvedValue(true)
    const server = createServer({
      underPressure: {
        healthCheck
      }
    })
    await server.ready()
    expect(healthCheck).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(5000)
    expect(healthCheck).toHaveBeenCalledTimes(2)
    jest.useRealTimers()
  })

  test('Custom health check throwing results in 503', async () => {
    jest.useFakeTimers('legacy')
    const healthCheck = jest
      .fn()
      .mockResolvedValueOnce(true) // First call passes (setup)
      .mockResolvedValueOnce(true) // Second call passes (GET /_health 1)
      .mockRejectedValueOnce(false) // Then it fails (GET /_health 2)
    const server = createServer({
      underPressure: {
        healthCheck,
        exposeStatusRoute: {
          url: '/_health',
          routeOpts: {
            logLevel: 'silent'
          }
        }
      }
    })
    await server.ready()
    const res1 = await server.inject({ method: 'GET', url: '/_health' })
    expect(res1.statusCode).toEqual(200)
    expect(res1.json()).toEqual({ status: 'ok' })
    jest.advanceTimersByTime(5000)
    const res2 = await server.inject({ method: 'GET', url: '/_health' })
    expect(res2.statusCode).toEqual(503)
    expect(res2.json()).toEqual({
      code: 'FST_UNDER_PRESSURE',
      error: 'Service Unavailable',
      message: 'Service Unavailable',
      statusCode: 503
    })
    jest.useRealTimers()
  })

  test('Disabled health monitoring', async () => {
    process.env.FASTIFY_MICRO_DISABLE_SERVICE_HEALTH_MONITORING = 'true'
    jest.useFakeTimers('legacy')
    const healthCheck = jest.fn().mockResolvedValue(true)
    const server = createServer({
      underPressure: {
        healthCheck
      }
    })
    await server.ready()
    expect(healthCheck).not.toHaveBeenCalled()
    jest.advanceTimersByTime(5000)
    expect(healthCheck).not.toHaveBeenCalled()
    jest.useRealTimers()
    process.env.FASTIFY_MICRO_DISABLE_SERVICE_HEALTH_MONITORING = undefined
  })
})
