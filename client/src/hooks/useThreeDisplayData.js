import { useEffect, useRef } from 'react'
import { useEquipStore } from '../store/equipStore'
import { createThreeDisplayProcessor } from '../util/threeDisplayProcessing'

export function useThreeDisplayData(sourceRef) {
  const displayRef = useRef({ pressure: {}, force: {} })
  useEffect(() => {
    const process = createThreeDisplayProcessor()
    const update = () => {
      const state = useEquipStore.getState()
      const next = process(sourceRef.current, state)
      if (!next) return
      displayRef.current = next
      state.setThreeDisplayStatus(next)
    }
    // One temporal step per incoming matrix, never per animation frame.
    const unsubscribe = useEquipStore.subscribe(update)
    update()
    return unsubscribe
  }, [sourceRef])
  return displayRef
}
