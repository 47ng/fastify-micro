import crypto from 'node:crypto'

export function randomID(bytes: number = 12) {
  return crypto.randomBytes(bytes).toString('base64url')
}
