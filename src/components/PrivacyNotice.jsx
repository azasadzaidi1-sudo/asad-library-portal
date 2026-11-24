import { PRIVACY_UPDATED } from '../lib/legal'

// The privacy notice. The postal address and email come from the database
// (see contact_details() in supabase/14_privacy_and_accounts.sql), so they
// never appear in the public code. `linkTo(page, label)` draws a link to
// the house rules or the Account page, which differs between the app and
// the Join page.
export default function PrivacyNotice({ contact, linkTo }) {
  const email = contact?.email
  return (
    <div className="legal">
      <p className="legal-updated">Last updated {PRIVACY_UPDATED}</p>
      <p>
        The Common Shelf is a private, invite-only lending library made of friends' bookshelves. It's free, has no
        ads and no tracking, and is run as a hobby by Syed Asad Imam Zaidi in Berlin. This notice explains what the
        app knows about you, who can see it, and what you can ask for.
      </p>

      <h2>Who is responsible</h2>
      <p>
        Syed Asad Imam Zaidi
        {contact === null ? ', Berlin, Germany. Loading the contact details…' : (
          <>
            , {contact.address || 'Berlin, Germany'}.
            {email && <> Email: <a href={`mailto:${email}`}>{email}</a></>}
          </>
        )}
      </p>

      <h2>What the app collects, and why</h2>
      <div className="legal-table-wrap">
        <table className="legal-table">
          <thead>
            <tr><th>What</th><th>Why</th><th>Legal basis (GDPR)</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Your email and password</td>
              <td>So you can sign in. The password is stored scrambled; nobody can read it.</td>
              <td>Art. 6(1)(b): our agreement under the {linkTo('rules', 'house rules')}</td>
            </tr>
            <tr>
              <td>Your name</td>
              <td>Shown next to your reviews and replies, on your shelf if you lend, and to librarians you ask to borrow from</td>
              <td>Art. 6(1)(b)</td>
            </tr>
            <tr>
              <td>Your city</td>
              <td>Private. If you lend books, it appears next to your shelf so members can pick a copy nearby.</td>
              <td>Art. 6(1)(b)</td>
            </tr>
            <tr>
              <td>Who invited you, and when you joined</td>
              <td>Lets a librarian see how you're connected when you ask to borrow, or ask for a library pass</td>
              <td>Art. 6(1)(f): legitimate interest in lending safely among people who know each other</td>
            </tr>
            <tr>
              <td>Your note to a librarian</td>
              <td>Helps a librarian you ask to borrow from, or ask for a library pass, place you</td>
              <td>Art. 6(1)(f)</td>
            </tr>
            <tr>
              <td>Reservations, loans, due dates and returns</td>
              <td>Running the lending</td>
              <td>Art. 6(1)(b)</td>
            </tr>
            <tr>
              <td>
                Your borrowing record: number of loans, late returns, loans from that librarian, librarians who've given
                you a library pass
              </td>
              <td>Shown to a librarian when you ask to borrow from them, or ask for their library pass</td>
              <td>Art. 6(1)(f)</td>
            </tr>
            <tr>
              <td>Library passes: which librarians have given you one, and your requests for one</td>
              <td>
                Pass holders reserve from that shelf without asking (Restricted books aside) and can see its Restricted
                Section. If a librarian takes a pass back, the app records that, so it can't be asked for again.
                Kept until your account is deleted.
              </td>
              <td>Art. 6(1)(f): lending among people who trust each other</td>
            </tr>
            <tr>
              <td>Loan messages</td>
              <td>
                Arranging the pick-up, questions about the book, running late, and talking about it afterwards. Kept as
                explained under "Loan messages" below.
              </td>
              <td>Art. 6(1)(b)</td>
            </tr>
            <tr>
              <td>Interested list, reviews and replies</td>
              <td>Features you choose to use</td>
              <td>Art. 6(1)(b)</td>
            </tr>
            <tr>
              <td>If you lend: your shelf, Restricted Section, shelf description, pick-up time and place</td>
              <td>Showing your books and arranging handovers</td>
              <td>Art. 6(1)(b)</td>
            </tr>
            <tr>
              <td>Which version of the house rules you accepted, and when</td>
              <td>A record that you agreed to them</td>
              <td>Art. 6(1)(b)</td>
            </tr>
            <tr>
              <td>Technical data such as your IP address</td>
              <td>Delivering the website and keeping it secure</td>
              <td>Art. 6(1)(f)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The app makes no automated decisions about you. Requests to borrow, library passes and Restricted Section
        requests are always decided by a librarian.
      </p>

      <h2>Who can see what</h2>
      <ul>
        <li>
          <strong>Other members</strong> see your name next to your reviews and replies, and whether you borrowed that
          book through the app. If you lend, they see your name, city, shelf and shelf description. Members can't open
          each other's profiles.
        </li>
        <li>
          <strong>Librarians you ask to borrow from, or ask for a library pass,</strong> see your name, your note, who
          invited you, when you joined, which librarians have given you a library pass, how many loans you've had,
          how many came back late, and how often you've borrowed from them. They also see your reservations and loans
          of their books, and your Interested marks on titles they own.
        </li>
        <li>
          <strong>A librarian's pass holders</strong>, and anyone with an approved request or a book out from that
          shelf, see that librarian's pick-up time and place. Only pass holders see a librarian's Restricted Section.
        </li>
        <li>
          <strong>Loan messages</strong> are seen only by the borrower and the librarian of that loan (see below).
        </li>
        <li>
          <strong>The person who invited you</strong> sees that you joined, for 14 days.
        </li>
        <li>
          <strong>Asad, as administrator,</strong> can see all data, including email addresses, to run and fix the
          app. He doesn't share it with anyone. He reads loan messages only if one of the two people in a
          conversation asks him to help with a problem.
        </li>
      </ul>
      <p>Nothing is sold, and there's no advertising, analytics or tracking.</p>

      <h2>Loan messages</h2>
      <p>
        When a reservation is confirmed, the borrower and the librarian get a conversation about that loan. Only the two
        of you can read it. Asad, as administrator, can technically open the database, but reads messages only if one
        of you asks him to help with a problem. A conversation turns read-only one week after the book is returned, or
        straight away if the reservation is cancelled or declined, and is deleted one month after that. You can delete
        your own messages; they then show as "Message deleted". If you delete your account, your messages stay in the
        other person's conversation under "Former member" until the conversation is deleted. Messages hold whatever
        you write, so share phone numbers or other contact details only if you want to.
      </p>

      <h2>Services that handle data for the app</h2>
      <ul>
        <li>
          <strong>Supabase</strong> (Supabase Pte. Ltd.) stores the database and handles sign-in on servers in
          Frankfurt, Germany, under a data processing agreement. Some platform data, such as performance metrics, can
          be handled outside Frankfurt; transfers out of the EU are covered by the EU's Standard Contractual Clauses.
        </li>
        <li>
          <strong>GitHub</strong> (GitHub, Inc., USA) serves the website and logs visitors' IP addresses for security.
          See the{' '}
          <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
            target="_blank" rel="noreferrer">GitHub Privacy Statement</a>.
        </li>
        <li>
          <strong>Open Library</strong> (Internet Archive, USA) supplies book covers. Covers load straight from Open
          Library, so your browser sends it your IP address. When a librarian adds a book, the search also goes to
          Open Library and to Wikidata (Wikimedia Foundation, USA).
        </li>
      </ul>
      <p>These US services handle what they receive under their own privacy policies.</p>

      <h2>What's stored on your device</h2>
      <p>
        Only your sign-in session, kept in your browser so you stay signed in; signing out removes it. There are no
        tracking cookies. The barcode scanner uses your camera on your device only, and no image is sent anywhere.
      </p>

      <h2>How long data is kept</h2>
      <p>
        As long as your account exists, except loan messages, which are deleted as explained above. You can delete your
        account on your {linkTo('account', 'Account page')} once you have no books out. Deleting it removes your
        sign-in, name, city, notes, Interested list, invitations and library passes.
        Records of past loans stay, and so do your reviews and replies, shown under "Former member" instead of your
        name. That keeps librarians' records of their books correct and book discussions whole. To take your reviews
        with you, delete them before closing your account.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask to see your data and get a copy, correct it, delete it, limit how it's used, or take it elsewhere.
        You can also object to the uses marked Art. 6(1)(f) above.{' '}
        {email ? <>Email <a href={`mailto:${email}`}>{email}</a>; you'll</> : <>Ask Asad; you'll</>} get an answer
        within one month.
      </p>
      <p>
        You can complain to a data protection authority, for example the Berlin Commissioner for Data Protection and
        Freedom of Information (<i>Berliner Beauftragte für Datenschutz und Informationsfreiheit</i>).
      </p>

      <h2>Do you have to give this data?</h2>
      <p>
        To join you need an email address, a password, your name and your city. Everything else is optional and comes
        from features you choose to use.
      </p>

      <h2>Changes to this notice</h2>
      <p>
        If anything important changes, you'll see a note in the app. The date at the top shows the current version.
      </p>
    </div>
  )
}
