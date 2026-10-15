// Participation is for members. These two primitives make that visible everywhere:
//
//   const gate = useMemberGate()
//   <button {...gate.lockProps('vote')} onClick={gate.guard(() => vote(id), 'vote')}>↑</button>
//
//   <MemberGate reason="chat"> <input …/> <button …>Send</button> </MemberGate>
//
// Non-members see the control dimmed with a lock; using it opens the Join flow ("Join to vote").
// Members get the control exactly as before. The server enforces the same rule; this is the UI.
import type { ReactNode } from 'react'
import { useIdentity } from './IdentityProvider'

export interface MemberGate {
  /** True for guests and pending (not-yet-onboarded) visitors */
  locked: boolean
  /** The member's wallet, or null */
  wallet: string | null
  /** Members run `fn`; anyone else gets the Join flow, told why */
  guard: <A extends unknown[]>(fn: (...args: A) => unknown, reason: string) => (...args: A) => void
  /** Spread on a participating control: lock styling + tooltip while locked */
  lockProps: (reason: string) => { 'data-locked'?: ''; 'aria-disabled'?: true; title?: string }
  /** Open the Join flow directly */
  join: (reason: string) => void
}

export function useMemberGate(): MemberGate {
  const { status, memberWallet, join } = useIdentity()
  const locked = status !== 'member'
  const verb = status === 'pending' ? 'Finish joining' : 'Join'
  return {
    locked,
    wallet: memberWallet,
    join,
    guard: (fn, reason) => (...args) => {
      if (locked) { join(reason); return }
      fn(...args)
    },
    lockProps: reason => (locked ? { 'data-locked': '', 'aria-disabled': true, title: `${verb} to ${reason}` } : {}),
  }
}

/**
 * Wraps a group of participation inputs (a chat box, a submit form). While locked the inputs are
 * inert and a "Join to …" button covers them; members see the children untouched.
 */
export function MemberGate({ reason, children, className }: { reason: string; children: ReactNode; className?: string }) {
  const { status, join } = useIdentity()
  const locked = status !== 'member'
  // Always the same wrapper (and className), so layout doesn't change between guest and member
  if (!locked) return <div className={className}>{children}</div>
  return (
    <div className={`member-gate${className ? ` ${className}` : ''}`}>
      <div className="member-gate-content" inert>{children}</div>
      <button type="button" className="member-gate-overlay" onClick={() => join(reason)}>
        <span className="member-gate-lock" aria-hidden>🔒</span>
        {status === 'pending' ? 'Finish joining' : 'Join'} to {reason}
      </button>
    </div>
  )
}
