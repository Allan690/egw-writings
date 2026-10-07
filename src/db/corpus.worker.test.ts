import { expect, it, vi } from 'vitest'
import type { CorpusApi } from './corpus.worker'
import type { BookCollection } from '../lib/corpusConstants'
import type { SearchHit } from './types'

const mocks = vi.hoisted(() => ({ expose: vi.fn(), search: vi.fn(), referenceHit: vi.fn() }))
vi.mock('comlink', () => ({ expose: mocks.expose }))
vi.mock('./opfsPool', () => ({ dbExists: async () => true, removeDb: vi.fn() }))
vi.mock('./corpusInstaller', () => ({ installCorpus: vi.fn() }))
vi.mock('../lib/opfsSupport', () => ({ isOpfsSupported: () => true }))
vi.mock('./corpusQueries', () => ({ CorpusDb: { open: async (_path: string, collection: BookCollection) => ({
  books: () => [], search: (...args: unknown[]) => mocks.search(collection, ...args),
  referenceHit: (...args: unknown[]) => mocks.referenceHit(collection, ...args),
}) } }))

it('honors collection/book filters and keeps reference paragraph identities', async () => {
  await import('./corpus.worker')
  const api = mocks.expose.mock.calls[0]![0] as CorpusApi
  await api.init()
  mocks.search.mockReturnValue([])
  mocks.referenceHit.mockImplementation((collection: string) => collection === 'egw'
    ? { id: 42, book_id: 'da', text: 'God’s love', reference: 'EW 38.1' } as SearchHit : null)
  expect(await api.search('EW 38.1', 40, undefined, 'egw')).toEqual([
    { id: 42, book_id: 'da', text: 'God’s love', reference: 'EW 38.1' },
  ])
  expect(mocks.search).not.toHaveBeenCalled()
  expect(await api.search('EW 38.1', 40, 'pp', 'egw')).toEqual([])
  await api.search('faith works', 40, 'da', 'egw')
  expect(mocks.search.mock.calls.every(call => call[0] === 'egw' && call[4] === 'da')).toBe(true)
  mocks.search.mockClear()
  await api.search('faith', 40, undefined, 'pioneer')
  expect(mocks.search).toHaveBeenCalledTimes(1)
  expect(mocks.search.mock.calls[0]![0]).toBe('pioneer')
})
