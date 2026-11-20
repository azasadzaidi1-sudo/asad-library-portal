import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useLibrary } from './lib/useLibrary'
import Login from './components/Login'
import CompleteProfile from './components/CompleteProfile'
import Header from './components/Header'
import Catalogue, { NO_FILTERS } from './components/Catalogue'
import MyBooks from './components/MyBooks'
import BookDialog from './components/BookDialog'
import LendingDesk from './components/LendingDesk'

// The app has three screens, chosen by who is visiting:
//   not signed in          -> Login
//   signed in, no name yet -> CompleteProfile (first visit after an invite)
//   signed in with a name  -> the library (catalogue or "My books")
export default function App() {
  // undefined = still checking, null = signed out, object = signed in
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <p className="status-page">Opening the library…</p>
  if (!session) return <Login />
  return <MemberArea userId={session.user.id} />
}

function MemberArea({ userId }) {
  const [member, setMember] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('members')
      .select('id, name, city, role')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => (error ? setError(error.message) : setMember(data)))
  }, [userId])

  if (error) {
    return (
      <p className="status-page" role="alert">
        Your member profile couldn't load: {error}. Refresh the page to try again.
      </p>
    )
  }
  if (!member) return <p className="status-page">Finding your library card…</p>
  if (!member.name) return <CompleteProfile member={member} onSaved={setMember} />
  return <Library member={member} />
}

// Which page to show comes from the end of the address (#my-books, #desk),
// so the browser's back button and bookmarks work without a routing library.
const PAGES = ['catalogue', 'my-books', 'desk']

function usePage() {
  const read = () => {
    const page = window.location.hash.slice(1)
    return PAGES.includes(page) ? page : 'catalogue'
  }
  const [page, setPage] = useState(read)
  useEffect(() => {
    const onChange = () => {
      setPage(read())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return page
}

function Library({ member }) {
  const library = useLibrary(member)
  const page = usePage()
  const [filters, setFilters] = useState(NO_FILTERS) // kept here so they survive a visit to My books
  const [openBookId, setOpenBookId] = useState(null)

  let content
  if (library.error) {
    content = (
      <p className="status-page" role="alert">
        The library couldn't load: {library.error}. Refresh the page to try again.
      </p>
    )
  } else if (!library.books) {
    content = <p className="status-page">Opening the catalogue drawers…</p>
  } else if (page === 'desk' && library.isLibrarian) {
    content = <LendingDesk library={library} onOpenBook={setOpenBookId} />
  } else if (page === 'my-books') {
    content = <MyBooks library={library} onOpenBook={setOpenBookId} />
  } else {
    content = (
      <Catalogue library={library} filters={filters} setFilters={setFilters} onOpenBook={setOpenBookId} />
    )
  }

  return (
    <>
      <Header member={member} page={page} />
      <main className="catalogue">{content}</main>
      {openBookId && library.booksById.has(openBookId) && (
        <BookDialog
          key={openBookId}
          book={library.booksById.get(openBookId)}
          library={library}
          member={member}
          onClose={() => setOpenBookId(null)}
        />
      )}
    </>
  )
}
