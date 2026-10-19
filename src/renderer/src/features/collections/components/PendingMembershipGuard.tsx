import { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'

// Short membership writes finish in their initiating context, not after a hidden navigation.
export function PendingMembershipGuard(): null {
  const blocker = useBlocker(true)
  useEffect(() => {
    if (blocker.state === 'blocked') {
      blocker.reset()
    }
  }, [blocker])
  return null
}
