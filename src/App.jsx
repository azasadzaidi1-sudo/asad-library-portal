import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useLibrary } from './lib/useLibrary'
import Login from './components/Login'
import Join from './components/Join'
import { joinCodeFromHash } from './lib/invites'
import CompleteProfile from './components/CompleteProfile'
import Header from './components/Header'
import Catalogue, { NO_FILTERS } from './components/Catalogue'
import BorrowingLists from './components/BorrowingLists'
import BookDialog from './components/BookDialog'
import LendingDesk from './components/LendingDesk'
import Libraries from './components/Libraries'
import AddBook from './components/AddBook'

// The app has three screens, chosen by who is visiting:
//   not signed in          -> Login (or Join, when they came from an invitation link)
//   signed in, no name yet -> CompleteProfile (first visit after an invite)
//   signed in with a name  -> the library (catalogue, Borrowing lists, …)
export default function App() {
  // undefined = still checking, null = signed out, object = signed in
  const [session, setSession] = useState(undefined)
  // Arriving from an invitation link ("#join=…") shows the Join page instead of Login.
  const [joinCode, setJoinCode] = useState(() => joinCodeFromHash())

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <p className="status-page">Opening the library…</p>
  if (!session) {
    if (joinCode) {
      return <Join code={joinCode} onSignIn={() => {
        window.history.replaceState(null, '', window.location.pathname)
        setJoinCode(null)
      }} />
    }
    return <Login />
  }
  return <MemberArea userId={session.user.id} />
}

function MemberArea({ userId }) {
  const [member, setMember] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('members')
      .select('id, name, city, is_admin')
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

// Which page to show comes from the end of the address (#libraries, #borrowing,
// #desk), so the browser's back button and bookmarks work without a routing library.
const PAGES = ['catalogue', 'libraries', 'borrowing', 'desk', 'add-book']
// Old addresses that still work: "My books" was renamed "Borrowing lists".
const OLD_PAGES = { 'my-books': 'borrowing' }

function usePage() {
  const read = () => {
    const hash = window.location.hash.slice(1)
    const page = OLD_PAGES[hash] ?? hash
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
  const [filters, setFilters] = useState(NO_FILTERS) // kept here so they survive a visit to another page
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
  } else if (page === 'libraries') {
    content = (
      <Libraries library={library}
        onBrowse={(ownerId) => {
          setFilters({ ...NO_FILTERS, library: ownerId })
          window.location.hash = 'catalogue'
        }} />
    )
  } else if (page === 'add-book') {
    content = <AddBook library={library} onOpenBook={setOpenBookId} />
  } else if (page === 'borrowing') {
    content = <BorrowingLists library={library} onOpenBook={setOpenBookId} />
  } else {
    content = (
      <Catalogue library={library} filters={filters} setFilters={setFilters} onOpenBook={setOpenBookId} />
    )
  }

  return (
    <>
      <Header member={member} page={page} isLibrarian={library.isLibrarian} />
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
