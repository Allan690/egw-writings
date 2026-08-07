export interface BookSource {
  id: string
  code: string
  title: string
  url: string
  year?: number
}

/** Public-domain Ellen G. White texts from CCEL (Christian Classics Ethereal Library). */
export const CCEL_BOOKS: BookSource[] = [
  {
    id: 'sc',
    code: 'SC',
    title: 'Steps to Christ',
    url: 'https://ccel.org/ccel/w/white/steps/cache/steps.txt',
    year: 1892,
  },
  {
    id: 'da',
    code: 'DA',
    title: 'The Desire of Ages',
    url: 'https://ccel.org/ccel/w/white/desire/cache/desire.txt',
    year: 1898,
  },
  {
    id: 'gc',
    code: 'GC',
    title: 'The Great Controversy',
    url: 'https://ccel.org/ccel/w/white/controversy/cache/controversy.txt',
    year: 1888,
  },
  {
    id: 'aa',
    code: 'AA',
    title: 'The Acts of the Apostles',
    url: 'https://ccel.org/ccel/w/white/acts/cache/acts.txt',
    year: 1911,
  },
  {
    id: 'pk',
    code: 'PK',
    title: 'The Story of Prophets and Kings',
    url: 'https://ccel.org/ccel/w/white/prophets/cache/prophets.txt',
    year: 1917,
  },
]
