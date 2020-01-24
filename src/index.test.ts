import { createServer } from './index'

it('injects the specified `name` property', () => {
  const unnamedServer = createServer()
  expect(unnamedServer.name).toBeUndefined()
  const namedServer = createServer({ name: 'foo' })
  expect(namedServer.name).toBe('foo')
})
