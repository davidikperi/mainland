import { test } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { createPlayerId } from './playerId.js'

test('creates distinct valid guest IDs without the secure-context randomUUID API', () => {
  const lanCrypto = { getRandomValues: bytes => webcrypto.getRandomValues(bytes) }
  const ids = Array.from({ length: 100 }, () => createPlayerId(lanCrypto))
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(new Set(ids).size, ids.length)
})

test('uses native UUID generation when available', () => {
  assert.equal(createPlayerId({ randomUUID: () => 'native-id' }), 'native-id')
})
