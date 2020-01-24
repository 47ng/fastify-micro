# `fastify-micro`

[![NPM](https://img.shields.io/npm/v/@47ng/fastify-micro?color=red)](https://www.npmjs.com/package/fastify-micro)
[![MIT License](https://img.shields.io/github/license/47ng/fastify-micro.svg?color=blue)](https://github.com/47ng/fastify-micro/blob/master/LICENSE)
[![Travis CI Build](https://img.shields.io/travis/com/47ng/fastify-micro.svg)](https://travis-ci.com/47ng/fastify-micro)
[![Dependabot Status](https://api.dependabot.com/badges/status?host=github&repo=47ng/fastify-micro)](https://dependabot.com)
[![Average issue resolution time](https://isitmaintained.com/badge/resolution/47ng/fastify-micro.svg)](https://isitmaintained.com/project/47ng/fastify-micro)
[![Number of open issues](https://isitmaintained.com/badge/open/47ng/fastify-micro.svg)](https://isitmaintained.com/project/47ng/fastify-micro)

Opinionated Node.js microservices framework built on fastify

## Features

- Secure and useful logging
- Load routes from a directory _(opt-in)_
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

Minimal example :

```ts
import { createServer, startServer } from 'fastify-micro'

const server = createServer()
startServer(server, 3000)
```

## Documentation

### Environment Variables

Details of the required and accepted (optional) environment variables
are available in the [`.env.example`](./.env.example) file.

### Logging

Fastify has a great logging story with
[pino](https://github.com/pinojs/pino).

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

Some security headers will also be redacted:

- Request headers:
  - `Cookie`
  - `Authorization`
  - `X-Secret-Token`
  - `X-CSRF-Token`
- Response headers:
  - `Set-Cookie`

> _todo: Propose a strategy to inject custom redacted fields_

#### Environment Context

In case you want to perform log aggregation across your services, it can
be useful to know who generated a log entry.

For that, you can pass a `name` in the options. It will add a `from`
field in the logs with that name :

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

> _**Note**_: for `INSTANCE_ID` and `COMMIT_ID`, only the first 8
> characters will be logged and sent to Sentry.

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

You can manually report an error:

```ts
// Anywhere you have access to the server object:
const error = new Error('Manual error report')
server.sentry.report(error)

// In a route:
const exampleRoute = (req, res) => {
  const error = new Error('Error from a route')
  // Add request context to the error
  server.sentry.report(error, req)
}
```

#### Enriching error reports

You can enrich your error reports by defining two async callbacks:

- `getUser`, to retrieve user information to pass to Sentry
- `getExtras`, to add any kind of extra key:value information

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
    getExtras: async (server, req) => {
      // Req may be undefined here
      return {
        foo: 'bar'
      }
    }
  }
})
```

> _**ProTip**_: if you're returning Personally Identifiable Information
> in your enrichment callbacks, don't forget to mention it in your
> privacy policy :)

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

<!-- todo: Add detailed documentation -->

- Disabled automatically when running in test runners and under
  instrumentation tools like Clinic.js
- Will log a warning if disabled in production

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
    // Custom health check for testing attached services health:
    healthCheck: async server => {
      try {
        await server.db.checkConnection()
        return true
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

> _**Note**_: the type for the `healthCheck` property differs from
> `under-pressure`: here the server is passed as an argument for
> convenience.

### Loading routes from the filesystem

Routes can be loaded from the filesystem, by passing a path to
recursively walk to the `routesDir` option:

```ts
import path from 'path'
import { createServer } from 'fastify-micro'

createServer({
  // Will load every file in ./routes
  routesDir: path.join(__dirname, 'routes')
})
```

Any file found under `rootDir` will be registered as a fastify plugin.
Failures will be ignored, and reported at the `trace` log level.

> _**Note**_: in development, the server will log its routes on startup.

Unlike Next.js filesystem-based routing, no assumption is made on the
name of your files vs the path of your routes. You are free to organise
your routes directory as you wish.

### Skip loading a file

If you have files under the routes directory that you don't want
registered, you can tell the router to skip it:

```ts
// ./routes/utility/do-not-load.ts

export const fastifyMicroSkipRouteLoad = true

// This file will be ignored by the router.
```

> _**Note**_: the file will still be `require`'d, so any side effects
> _will_ run.

### Other default plugins & configuration

<!-- todo: Add detailed documentation -->

The following plugins are loaded by default:

- [`fastify-sensible`](https://github.com/fastify/fastify-sensible),
  for convention-based error handling.

### Loading other plugins

The server returned by `createServer` is a fastify instance, you can
register any fastify-compatible plugin onto it, and use the full Fastify
API:

```ts
const server = createServer()

server.register(require('fastify-cors'))

server.get('/', () => 'Hello, world !')
```

For loading plugins before filesystem routes are loaded, a `configure`
method can be provided in the options:

```ts
const server = createServer({
  configure: server => {
    server.addHook('onRoute', route => {
      // Will be invoked for every loaded route
    })
    // Will run before the routes are loaded
    server.decorate('db', databaseClient)
  }
})

server.decorate('after', 'Will run after the routes are loaded')
```

## License

[MIT](https://github.com/47ng/fastify-micro/blob/master/LICENSE) - Made with ❤️ by [François Best](https://francoisbest.com).
