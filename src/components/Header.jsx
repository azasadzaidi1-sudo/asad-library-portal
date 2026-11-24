import { supabase } from '../supabaseClient'

export default function Header({ member, page, isLibrarian }) {
  const link = (target, label) => (
    <a href={`#${target}`} className="nav-link" aria-current={page === target ? 'page' : undefined}>
      {label}
    </a>
  )

  return (
    <header className="masthead">
      <div className="masthead-inner">
        <p className="masthead-title">The Common Shelf</p>
        <nav className="masthead-nav" aria-label="Pages">
          {link('catalogue', 'Catalogue')}
          {link('libraries', 'Libraries')}
          {link('borrowing', 'Borrowing lists')}
          {isLibrarian && link('desk', 'Lending desk')}
        </nav>
        <div className="masthead-user">
          <a href="#account" className="masthead-name" aria-current={page === 'account' ? 'page' : undefined}
            title="Your account">
            {member.name}
            {isLibrarian && <span className="role"> (librarian)</span>}
          </a>
          <button type="button" className="link-button" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
