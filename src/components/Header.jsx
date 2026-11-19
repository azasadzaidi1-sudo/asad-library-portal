import { supabase } from '../supabaseClient'

export default function Header({ member }) {
  return (
    <header className="masthead">
      <div className="masthead-inner">
        <h1 className="masthead-title">Asad's Library</h1>
        <div className="masthead-user">
          <span>
            {member.name}
            {member.role === 'librarian' && <span className="role"> (librarian)</span>}
          </span>
          <button type="button" className="link-button" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
