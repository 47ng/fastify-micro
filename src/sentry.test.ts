import { createServer } from './index'
import sentryTestkit from 'sentry-testkit'
import waitForExpect from 'wait-for-expect'

describe('Sentry reporting', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    jest.resetModules() // this is important - it clears the cache
    process.env = { ...OLD_ENV }
    delete process.env.NODE_ENV
  })

  afterEach(() => {
    process.env = OLD_ENV
  })

  const setupEnv = () => {
    process.env.NODE_ENV = 'test'
    process.env.LOG_LEVEL = 'silent'
    process.env.SENTRY_DSN =
      'https://00000000000000000000000000000000@sentry.io/000001'
  }

  // --

  test('Sentry is disabled without a DSN', async () => {
    const { testkit, sentryTransport } = sentryTestkit()
    process.env.NODE_ENV = 'test'
    process.env.LOG_LEVEL = 'silent'
    const server = createServer({
      sentry: {
        transport: sentryTransport
      }
    })
    await server.ready()
    await server.sentry.report(new Error('crash'))
    waitForExpect(() => {
      expect(testkit.reports()).toHaveLength(0)
    })
  })

  // --

  test('Sentry is enabled with a DSN', async () => {
    const { testkit, sentryTransport } = sentryTestkit()
    setupEnv()
    const server = createServer({
      sentry: {
        transport: sentryTransport
      }
    })
    await server.ready()
    await server.sentry.report(new Error('crash'))
    await waitForExpect(() => {
      expect(testkit.reports()).toHaveLength(1)
    })
    const report = testkit.reports()[0]
    expect(report.error?.message).toEqual('crash')
  })

  // --

  test('Sentry report for route errors', async () => {
    const { testkit, sentryTransport } = sentryTestkit()
    setupEnv()
    const server = createServer({
      sentry: {
        transport: sentryTransport
      }
    })
    server.get('/', async () => {
      throw new Error('crash')
    })
    await server.ready()
    const res = await server.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toEqual(500)
    expect((res.json() as any).message).toEqual('crash')
    await waitForExpect(() => {
      expect(testkit.reports()).toHaveLength(1)
    })
    const report = testkit.reports()[0]
    expect(report.error?.message).toEqual('crash')
  })

  // --

  test('Report enrichment in route', async () => {
    const { testkit, sentryTransport } = sentryTestkit()
    setupEnv()
    const server = createServer({
      sentry: {
        transport: sentryTransport
      }
    })
    server.get('/', async req => {
      await server.sentry.report(new Error('crash'), req, {
        tags: {
          foo: 'bar'
        },
        context: {
          egg: 'spam'
        }
      })
      return 'foo'
    })
    await server.ready()
    await server.inject({ method: 'GET', url: '/' })
    await waitForExpect(() => {
      expect(testkit.reports()).toHaveLength(1)
    })
    const report = testkit.reports()[0]
    expect(report.error?.message).toEqual('crash')
    expect(report.tags.path).toEqual('/')
    expect(report.tags.foo).toEqual('bar')
    expect(report.extra?.egg).toEqual('spam')
  })

  // --

  test('Report enrichment, global getters', async () => {
    const { testkit, sentryTransport } = sentryTestkit()
    setupEnv()
    process.env.COMMIT_ID = 'git-sha1'
    process.env.INSTANCE_ID = 'localdev'
    const sentryOptions = {
      transport: sentryTransport,
      release: 'test-release',
      getExtra: () =>
        Promise.resolve({
          tags: {
            foo: 'bar'
          },
          context: {
            egg: 'spam'
          }
        }),
      getUser: jest.fn()
    }

    const server = createServer({
      name: 'test-server',
      sentry: sentryOptions
    })
    await server.ready()
    await server.sentry.report(new Error('crash'))
    await waitForExpect(() => {
      expect(testkit.reports()).toHaveLength(1)
    })
    // getUser is only called in the context of a request
    expect(sentryOptions.getUser).not.toHaveBeenCalled()
    const report = testkit.reports()[0]
    expect(report.error?.message).toEqual('crash')
    expect(report.tags.service).toEqual('test-server')
    expect(report.tags.foo).toEqual('bar')
    expect(report.extra?.egg).toEqual('spam')
    expect(report.extra?.commit).toEqual('git-sha1')
    expect(report.extra?.instance).toEqual('localdev')
    expect(report.release).toEqual('test-release')
  })

  // --

  test('User enrichment', async () => {
    const { testkit, sentryTransport } = sentryTestkit()
    setupEnv()
    const server = createServer({
      sentry: {
        transport: sentryTransport,
        getUser: () =>
          Promise.resolve({
            email: 'foo@bar.com',
            username: 'foobar',
            id: 'eggspam'
          })
      }
    })
    server.get('/', async req => {
      await server.sentry.report(new Error('crash'), req)
      return 'foo'
    })
    await server.ready()
    await server.inject({ method: 'GET', url: '/' })
    await waitForExpect(() => {
      expect(testkit.reports()).toHaveLength(1)
    })
    const report = testkit.reports()[0]
    expect(report.user?.email).toEqual('foo@bar.com')
    expect(report.user?.username).toEqual('foobar')
    expect(report.user?.id).toEqual('eggspam')
  })

  // --

  test('4xx statuses are not reported to Sentry', async () => {
    const { testkit, sentryTransport } = sentryTestkit()
    setupEnv()
    const server = createServer({
      sentry: {
        transport: sentryTransport
      }
    })
    server.get('/', async () => {
      throw server.httpErrors.unauthorized('nope')
    })
    await server.ready()
    await server.inject({ method: 'GET', url: '/' })
    await new Promise(r => setTimeout(r, 250))
    expect(testkit.reports()).toHaveLength(0)
  })

  // --

  test('Schema validation errors are not reported to Sentry', async () => {
    const { testkit, sentryTransport } = sentryTestkit()
    setupEnv()
    const server = createServer({
      sentry: {
        transport: sentryTransport
      }
    })
    server.post<{ Body: { name: string } }>(
      '/',
      {
        schema: {
          body: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' }
            }
          }
        }
      },
      async req => {
        return `Hello, ${req.body.name}`
      }
    )
    await server.ready()
    const res = await server.inject({ method: 'POST', url: '/' })
    expect(res.statusCode).toEqual(400)
    await new Promise(r => setTimeout(r, 250))
    expect(testkit.reports()).toHaveLength(0)
  })
})
