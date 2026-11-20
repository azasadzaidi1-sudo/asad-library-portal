import { supabase } from '../supabaseClient'

export default function Header({ member, page }) {
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
          {link('my-books', 'My books')}
          {member.role === 'librarian' && link('desk', 'Lending desk')}
        </nav>
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
