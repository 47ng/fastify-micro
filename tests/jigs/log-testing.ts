import { spawn } from 'node:child_process'
import path from 'node:path'

export async function testLogs<T = any>(
  matcher: (logLine: T) => boolean,
  expectedCount = 1
) {
  const subprocessFilePath = path.resolve(__dirname, 'log-testing.fixture.ts')
  const testProcess = spawn('ts-node', [subprocessFilePath])
  const logLines: Set<T> = new Set()

  return new Promise<T[]>(resolve => {
    const callback = (data: string) => {
      data
        .toString()
        .split('\n')
        .filter(line => line.startsWith('{') && line.endsWith('}'))
        .map(text => JSON.parse(text))
        .filter(matcher)
        .forEach(item => logLines.add(item))

      if (logLines.size >= expectedCount) {
        testProcess.kill('SIGINT')
        testProcess.stdout.off('data', callback)
        resolve(Array.from(logLines.values()))
      }
    }
    testProcess.stdout.on('data', callback)
  })
}
