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

### Logging

<!-- todo: Add detailed documentation -->

Logging should be safe
=> redaction of environment variables
=> redaction of sensitive headers

Request ID

User fingerprinting

Environment context

- Service name
- Commit
- Instance

### Sentry

Opt-in support for [Sentry](https://sentry.io) is provided, and can be
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

#### Sentry Releases

There are two ways to tell Sentry about which Release to use when
reporting errors:

- Via the `SENTRY_RELEASE` environment variable
- Via the `sentry.release` option key:

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

We use [`under-pressure`](https://github.com/fastify/under-pressure)
to monitor the health of the service, and expose a health check route
at `/_health`.

Default configuration:

- Max event loop delay: 1 second
- Health check interval: 5 seconds

Options for `under-pressure` can be provided under the `underPressure`
key in the server options:

```ts
createServer({
  underPressure: {
    // We recommend you define at least this one if you need
    // to check the status of dependent services:
    healthCheck: async () => {
      // eg: Check database connection here
      return true
    },

    // You can also pass anything accepted by under-pressure options:
    maxEventLoopDelay: 3000
  }
})
```

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

> _**Note**_: The file will still be `require`'d, so any side effects
> _will_ run.

### Other default plugins & configuration

<!-- todo: Add detailed documentation -->

The following plugins are loaded by default:

- [`fastify-sensible`](https://github.com/fastify/fastify-sensible), for convention-based error handling.

## License

[MIT](https://github.com/47ng/fastify-micro/blob/master/LICENSE) - Made with ❤️ by [François Best](https://francoisbest.com).
