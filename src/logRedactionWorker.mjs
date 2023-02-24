import build from 'pino-abstract-transport'
import * as redactEnv from 'redact-env'

export default async function redactEnvInLogsWorker(options) {
  // todo: Build the regexp on the main thread?
  const regexp = redactEnv.build(options.redactEnv)
  return build(
    async function redactEnvInLogs(source) {
      for await (let line of source) {
        console.log('• ' + redactEnv.redact(line, regexp))
      }
    },
    {
      parse: 'lines'
    }
  )
}
