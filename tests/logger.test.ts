import { testLogs } from './jigs/log-testing'

describe('Logger', () => {
  test('name property', async () => {
    const [logLine] = await testLogs(logLine => logLine.dataTestID === 'name')
    expect(logLine.from).toEqual('foo')
  })

  test('redact environment variables', async () => {
    const [logLine] = await testLogs(
      logLine => logLine.dataTestID === 'redact-env'
    )
    expect(logLine.env).toEqual('[secure]')
  })

  test('redact log paths', async () => {
    const [logLine] = await testLogs(
      logLine => logLine.dataTestID === 'redact-path'
    )
    expect(logLine.secret).toEqual('[Redacted]')
  })

  test('request ID generator', async () => {
    type ReqResLog = { reqId: string }

    const [req1, res1, req2, res2, req3, res3, req4, res4] =
      await testLogs<ReqResLog>(logLine => Boolean(logLine.reqId), 8)
    const [clientId1, requestId1] = req1.reqId.split('.')
    const [clientId2, requestId2] = req2.reqId.split('.')
    const [clientId3, requestId3] = req3.reqId.split('.')
    const [clientId4, requestId4] = req4.reqId.split('.')
    expect(req1.reqId).toEqual(res1.reqId)
    expect(req2.reqId).toEqual(res2.reqId)
    expect(req3.reqId).toEqual(res3.reqId)
    expect(req4.reqId).toEqual(res4.reqId)
    expect(clientId1).toEqual('0GC65G13aziD6-bt')
    expect(clientId2).toEqual('0GC65G13aziD6-bt')
    expect(clientId3).toEqual('GTpLN93VxyzzyOyZ')
    expect(clientId4).toEqual('d5l1mrd8IzLwejLW')
    expect(requestId1).not.toEqual(requestId2)
    expect(requestId1).not.toEqual(requestId3)
    expect(requestId1).not.toEqual(requestId4)
  })
})
