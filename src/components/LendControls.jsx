import { useState } from 'react'
import { memberLabel } from '../lib/catalogue'

// "Lend [copy] to [member] [Lend]". The copy list only appears when there's
// more than one copy on the shelf; the member list is skipped when the
// member is already known (handing over a reservation).
export default function LendControls({ copies, members, member, defaultMemberId = '', onLend, busy }) {
  const [copyId, setCopyId] = useState(copies[0]?.id ?? '')
  const [memberId, setMemberId] = useState(member?.id ?? defaultMemberId)

  return (
    <div className="lend">
      {copies.length > 1 && (
        <label>
          Copy
          <select value={copyId} onChange={(e) => setCopyId(Number(e.target.value))}>
            {copies.map((c) => (
              <option key={c.id} value={c.id}>{copyName(c)}</option>
            ))}
          </select>
        </label>
      )}
      {!member && (
        <label>
          Lend to
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">Choose a member</option>
            {members.map((m) => (
              <option key={m.id} value={m.id} disabled={m.hasBook}>
                {memberLabel(m)}{m.hasBook ? ', already has a book' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="button" className="button" disabled={busy || !memberId || !copyId}
        onClick={() => onLend(copyId, memberId)}>
        {member ? `Lend to ${member.name ?? 'them'}` : 'Lend'}
      </button>
    </div>
  )
}

// "Copy 2, Older paperback, lightning cover"
export function copyName(copy) {
  return `Copy ${copy.number}${copy.edition_note ? `, ${copy.edition_note}` : ''}`
}
