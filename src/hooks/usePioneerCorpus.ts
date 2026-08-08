import { useEffect, useState } from 'react'
import {
  getPioneerLoadState,
  startPioneerBackgroundLoad,
  subscribePioneerLoad,
  type PioneerLoadState,
} from '../db/pioneerLoader'

export function usePioneerCorpus(enabled: boolean) {
  const [state, setState] = useState<PioneerLoadState>(getPioneerLoadState())

  useEffect(() => {
    return subscribePioneerLoad(setState)
  }, [])

  useEffect(() => {
    if (!enabled) return
    void startPioneerBackgroundLoad()
  }, [enabled])

  return state
}
