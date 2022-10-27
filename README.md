<h1 align="center"><code>fastify-micro</code></h1>

<div align="center">

[![NPM](https://img.shields.io/npm/v/fastify-micro?color=red)](https://www.npmjs.com/package/fastify-micro)
[![MIT License](https://img.shields.io/github/license/47ng/fastify-micro.svg?color=blue)](https://github.com/47ng/fastify-micro/blob/master/LICENSE)
[![CI/CD](https://github.com/47ng/fastify-micro/workflows/CI%2FCD/badge.svg?branch=next)](https://github.com/47ng/fastify-micro/actions)
[![Coverage Status](https://coveralls.io/repos/github/47ng/fastify-micro/badge.svg?branch=next)](https://coveralls.io/github/47ng/fastify-micro?branch=next)

</div>

<p align="center">
  Opinionated Node.js microservices framework built on <a href="https://fastify.io">Fastify</a>.
</p>

## Features

- Secure and useful logging
- [Auto-load](https://github.com/fastify/fastify-autoload) routes & plugins from the filesystem _(opt-in)_
- Built-in [Sentry](#sentry) support for error reporting _(opt-in)_
- Service health monitoring
- Graceful exit
- First class TypeScript support

## Installation

```shell
$ yarn add fastify-micro
# or
$ npm i fastify-micro
```

## Usage

Minimal example:

```ts
import { createServer, startServer } from 'fastify-micro'

const server = createServer()

startServer(server)
```

## Documentation

### Environment Variables

Details of the required and accepted (optional) environment variables
are available in the [`.env.example`](./.env.example) file.

### Listening port

You can provide the port number where the server will be listening as
the second argument of `startServer`:

```ts
import { createServer, startServer } from 'fastify-micro'

const server = createServer()
startServer(server, 3000)
```

If omitted, the port number will be read from the `PORT` environment
variable:

```ts
// process.env.PORT = 4000

import { createServer, startServer } from 'fastify-micro'

const server = createServer()
startServer(server)

// Server started on 0.0.0.0:4000
```

If no value is specified either via code or environment, the default port will
be 3000.

### Auto-loading plugins and routes from the filesystem

Plugins and routes can be loaded from the filesystem using
[`fastify-autoload`](https://github.com/fastify/fastify-autoload):

```ts
import path from 'path'
import { createServer } from 'fastify-micro'

createServer({
  plugins: {
    dir: path.join(__dirname, 'plugins')
  },
  routes: {
    dir: path.join(__dirname, 'routes')
  }
})
```

The `plugins` and `routes` options are `fastify-autoload` configuration objects.

As recommended by Fastify, plugins will be loaded first, then routes.
Attach your external services, decorators and hooks as plugin files, so that
they will be loaded when declaring your routes.

#### Printing Routes

In development, the server will log the route tree on startup.
This can be configured:

```ts
createServer({
  printRoutes:
    | 'auto'    // default: `console` in development, silent in production.
    | 'console' // always pretty-print routes using `console.info` (for humans)
    | 'logger'  // always print as NDJSON as part of the app log stream (info level)
    | false     // disable route printing
})
```

### Other default plugins

The following plugins are loaded by default:

- [`fastify-sensible`](https://github.com/fastify/fastify-sensible),
  for convention-based error handling.

### Loading other plugins

The server returned by `createServer` is a Fastify instance, you can
register any Fastify-compatible plugin onto it, and use the full Fastify
API:

```ts
const server = createServer()

server.register(require('fastify-cors'))

server.get('/', () => 'Hello, world !')
```

### Logging

Fastify already has a great logging story with
[pino](https://github.com/pinojs/pino), this builds upon it.

#### Logs Redaction

Logs should be safe: no accidental leaking of access tokens and other
secrets through environment variables being logged. For this,
[`redact-env`](https://github.com/47ng/redact-env) is used.

By default, it will only redact the value of `SENTRY_DSN` (see
[Sentry](#sentry) for more details), but you can pass it additional
environment variables to redact:

```ts
createServer({
  // The values of these environment variables
  // will be redacted in the logs:
  redactEnv: [
    'JWT_SECRET',
    'AWS_S3_TOKEN',
    'DATABASE_URI'
    // etc...
  ]
})
```

You can also redact log fields by passing [Pino redact paths](https://getpino.io/#/docs/redaction)
to the `redactLogPaths` option:

```ts
createServer({
  // The values of these headers
  // will be redacted in the logs:
  redactLogPaths: [
    'req.headers["x-myapp-client-secret"]',
    'res.headers["x-myapp-server-secret"]'
    // etc...
  ]
})
```

The following security headers will be redacted by default:

- Request headers:
  - `Cookie`
  - `Authorization`
  - `X-Secret-Token`
  - `X-CSRF-Token`
- Response headers:
  - `Set-Cookie`

#### Environment Context

In case you want to perform log aggregation across your services, it can
be useful to know who generated a log entry.

For that, you can pass a `name` in the options. It will add a `from`
field in the logs with that name:

```ts
const server = createServer({
  name: 'api'
})

// The `name` property is now available on your server:
server.log.info({ msg: `Hello, ${server.name}` })
// {"from":"api":"msg":"Hello, api",...}
```

To add more context to your logs, you can set the following optional
environment variables:

| Env Var Name  | Log Key    | Description                                              |
| ------------- | ---------- | -------------------------------------------------------- |
| `INSTANCE_ID` | `instance` | An identifier for the machine that runs your application |
| `COMMIT_ID`   | `commit`   | The git SHA-1 of your code                               |

> _**Note**_: for both `INSTANCE_ID` and `COMMIT_ID`, only the first 8
> characters will be logged or sent to Sentry.

#### Request ID

By default, Fastify uses an incremental integer for its request ID, which
is fast but lacks context and immediate visual identification.

Instead, `fastify-micro` uses a request ID that looks like this:

```
To9hgCK4MvOmFRVM.oPoAOhj93kEgbIdV
```

It is made of two parts, separated by a dot `'.'`:

- `To9hgCK4MvOmFRVM` is the user fingerprint
- `oPoAOhj93kEgbIdV` is a random identifier

The user fingerprint is a hash of the following elements:

- The source IP address
- The user-agent header
- A salt used for anonymization

The second part of the request ID is a random string of base64 characters
that will change for every request, but stay common across the lifetime
of the request, making it easier to visualize which requests are linked
in the logs:

```json
// Other log fields removed for brievity
{"reqId":"To9hgCK4MvOmFRVM.psM5GNErJq4l6OD6","req":{"method":"GET","url":"/foo"}}
{"reqId":"To9hgCK4MvOmFRVM.psM5GNErJq4l6OD6","res":{"statusCode":200}}
{"reqId":"To9hgCK4MvOmFRVM.oPoAOhj93kEgbIdV","req":{"method":"POST","url":"/bar"}}
{"reqId":"To9hgCK4MvOmFRVM.oPoAOhj93kEgbIdV","res":{"statusCode":201}}
{"reqId":"KyGsnkFDdtKLQUaW.Jj6TgkSAYJ4hcxLR","req":{"method":"GET","url":"/egg"}}
{"reqId":"KyGsnkFDdtKLQUaW.Jj6TgkSAYJ4hcxLR","res":{"statusCode":200}}
```

Here we can quickly see that:

- There are two users interacting with the service
- User `To9hgCK4MvOmFRVM` made two requests:
  - `psM5GNErJq4l6OD6` - `GET /foo -> 200`
  - `oPoAOhj93kEgbIdV` - `POST /bar -> 201`
- User `KyGsnkFDdtKLQUaW` made one request:
  - `Jj6TgkSAYJ4hcxLR` - `GET /egg -> 200`

#### Anonymising Request ID Fingerprints

By default, request ID fingerprints are rotated every time an app is
built (when `createServer` is called). This will most likely correspond
to when your app starts, and would make it impossible to track users
across restarts of your app, or across multiple instances when scaling
up. While it's good for privacy (while keeping a good debugging value
per-service), it will be a pain for distributed systems.

If you need reproducibility in the fingerprint, you can set the
`LOG_FINGERPRINT_SALT` environment variable to a constant across your
services / instances.

### Sentry

Built-in support for [Sentry](https://sentry.io) is provided, and can be
activated by setting the `SENTRY_DSN` environment variable to the
[DSN](https://docs.sentry.io/error-reporting/quickstart/?platform=node#configure-the-sdk)
that is found in your project settings.

Sentry will receive any unhandled errors (5xx) thrown by your
application. 4xx errors are considered "handled" errors and will not be
reported.

You can manually report an error, at the server or request level:

```ts
// Anywhere you have access to the server object:
const error = new Error('Manual error report')
server.sentry.report(error)

// In a route:
const exampleRoute = (req, res) => {
  const error = new Error('Error from a route')
  // This will add request context to the error:
  req.sentry.report(error)
}
```

#### Enriching error reports

You can enrich your error reports by defining two async callbacks:

- `getUser`, to retrieve user information to pass to Sentry
- `getExtra`, to add two kinds of extra key:value information:
  - `tags`: tags are searchable string-based key/value pairs, useful for filtering issues/events.
  - `context`: extra data to display in issues/events, not searchable.

Example:

```ts
import { createServer } from 'fastify-micro'

createServer({
  sentry: {
    getUser: async (server, req) => {
      // Example: fetch user from database
      const user = await server.db.findUser(req.auth.userID)
      return user
    },
    getExtra: async (server, req) => {
      // Req may be undefined here
      return {
        tags: {
          foo: 'bar' // Can search/filter issues by `foo`
        },
        context: {
          egg: 'spam'
        }
      }
    }
  }
})
```

> _**ProTip**_: if you're returning Personally Identifiable Information
> in your enrichment callbacks, don't forget to mention it in your
> privacy policy 🙂

You can also enrich manually-reported errors:

```ts
const exampleRoute = (req, res) => {
  const error = new Error('Error from a route')
  // Add extra data to the error
  req.sentry.report(error, {
    tags: {
      projectID: req.params.projectID
    },
    context: {
      performance: 42
    }
  })
}
```

<details>
<summary>
  <h4>Note: v2 to v3 migration</h4>
</summary>

in versions <= 2.x.x, the request object was passed as the second argument to the `report` function.

To migrate to version 3.x.x, you can remove this argument and use the `sentry`
decoration on the request instead:

```ts
const exampleRoute = (req, res) => {
  const error = new Error('Error from a route')

  // version 2.x.x
  server.sentry.report(error, req, {
    // Extra context
  })

  // version 3.x.x
  req.sentry.report(error, {
    // Extra context
  })
}
```

</details>

#### Sentry Releases

There are two ways to tell Sentry about which
[Release](https://docs.sentry.io/workflow/releases/?platform=node)
to use when reporting errors:

- Via the `SENTRY_RELEASE` environment variable
- Via the options:

```ts
import { createServer } from 'fastify-micro'

createServer({
  sentry: {
    release: 'foo'
  }
})
```

A value passed in the options will take precedence over a value passed
by the environment variable.

### Graceful exit

When receiving `SIGINT` or `SIGTERM`, Fastify applications quit instantly,
potentially leaking file descriptors or open resources.

To clean up before exiting, add a `cleanupOnExit` callback in the options:

```ts
createServer({
  cleanupOnExit: async app => {
    // Release external resources
    await app.database.close()
  }
})
```

This uses the Fastify `onClose` hook, which will be called when receiving a
termination signal. If the onClose hooks take too long to resolve, the process
will perform a hard-exit after a timeout.

You can specify the list of signals to handle gracefully, along with a few other
options:

```ts
createServer({
  gracefulShutdown: {
    signals: ['SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGTSTP'],

    // How long to wait for the onClose hooks to resolve
    // before perfoming a hard-exit of the process (default 10s):
    timeoutMs: 20_000,

    // The exit code to use when hard-exiting (default 1)
    hardExitCode: 123
  }
})
```

### Service availability monitoring & health check

[`under-pressure`](https://github.com/fastify/under-pressure)
is used to monitor the health of the service, and expose a health check
route at `/_health`.

Default configuration:

- Max event loop delay: 1 second
- Health check interval: 5 seconds

Options for `under-pressure` can be provided under the `underPressure`
key in the server options:

```ts
createServer({
  underPressure: {
    // Custom health check for testing attached services' health:
    healthCheck: async server => {
      try {
        const databaseOk = Boolean(await server.db.checkConnection())
        // Returned data will show up in the endpoint's response:
        return {
          databaseOk
        }
      } catch (error) {
        server.sentry.report(error)
        return false
      }
    },

    // You can also pass anything accepted by under-pressure options:
    maxEventLoopDelay: 3000
  }
})
```

If for some reason you wish to disable service health monitoring, you can set
the `FASTIFY_MICRO_DISABLE_SERVICE_HEALTH_MONITORING` environment variable to `true`.

## License

[MIT](https://github.com/47ng/fastify-micro/blob/master/LICENSE) - Made with ❤️ by [François Best](https://francoisbest.com)

Using this package at work ? [Sponsor me](https://github.com/sponsors/franky47) to help with support and maintenance.
