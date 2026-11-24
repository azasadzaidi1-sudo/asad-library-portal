import { RULES_UPDATED } from '../lib/legal'

// The house rules (the terms of use). Asad's email comes from the database,
// like the address in the privacy notice. `linkTo(page, label)` draws a link
// to the privacy notice or the Account page.
export default function HouseRules({ contact, linkTo }) {
  const email = contact?.email
  return (
    <div className="legal">
      <p className="legal-updated">Last updated {RULES_UPDATED}</p>
      <p>
        These are the terms of use for The Common Shelf. They're short because the idea is simple: friends lend each
        other books, and everyone looks after them.
      </p>

      <h2>1. What The Common Shelf is</h2>
      <p>
        A free, private, invite-only catalogue of friends' bookshelves, run as a hobby by Syed Asad Imam Zaidi
        ("Asad") in Berlin. The app keeps track of who has which book; the books themselves change hands in person.
        Asad may change the app or close it. Before closing, he'll give at least 30 days' notice so books can find
        their way home.
      </p>
      <p>
        Something wrong, such as a post, a loan or a person?{' '}
        {email ? <>Email Asad at <a href={`mailto:${email}`}>{email}</a>.</> : 'Tell Asad.'}
      </p>

      <h2>2. Joining</h2>
      <ul>
        <li>You need an invitation and must be 18 or older.</li>
        <li>One account per person, under your real name. Keep your password to yourself.</li>
        <li>Invite only people you know personally. Your name is shown as the person who invited them.</li>
      </ul>

      <h2>3. Borrowing and lending</h2>
      <ul>
        <li>
          Each loan is an agreement between the borrower and the librarian who owns the book. Asad is only part of it
          when it's his book.
        </li>
        <li>
          <strong>Borrowers:</strong> look after the book, and return it by the due date (four weeks) or ask the
          librarian for more time. Normal wear is fine. If a book gets damaged or lost, tell the librarian straight
          away and agree on a fix together, such as a repair or a replacement copy.
        </li>
        <li>
          <strong>Librarians:</strong> lend only books you own, and describe your copies honestly. You decide whom
          you lend to, and you can say no or stop lending to someone without giving a reason.
        </li>
        <li>No money changes hands: no fees, deposits, sales or rentals through the app.</li>
      </ul>

      <h2>4. The Restricted Section</h2>
      <p>
        Some titles need a librarian's approval before they can be borrowed. A book on a shelf is not an endorsement of
        what it says.
      </p>

      <h2>5. Reviews and replies</h2>
      <ul>
        <li>Be kind, and mark spoilers.</li>
        <li>
          No insults, harassment, hate, illegal content or advertising, and no personal details about other people.
        </li>
        <li>Your words stay yours. By posting, you allow them to be shown to members inside the app.</li>
        <li>Asad may remove posts that break these rules.</li>
      </ul>

      <h2>6. Respect other members' privacy</h2>
      <p>
        What you see in the app about other members (their city, pick-up places, borrowing record or notes) stays in
        the app. Don't copy it or pass it on.
      </p>

      <h2>7. Leaving, or being asked to leave</h2>
      <p>
        You can delete your account at any time on your {linkTo('account', 'Account page')}, once your borrowed books
        are back with their owners and none of your own books are out on loan. Asad may suspend or close an account
        that breaks these rules, normally after a word with the person first.
      </p>

      <h2>8. Liability</h2>
      <p>
        The app is free and offered as it is, without a promise that it will always work or be available. Asad is
        fully liable for harm he causes on purpose or through gross negligence, and for harm to life, body or health.
        Beyond that, because the app is free, he isn't liable for slight negligence. Between members, loans follow
        German law on free lending (<i>Leihe</i>, §§ 598–606 BGB): the lender answers only for intent and gross
        negligence, and the borrower isn't liable for normal wear.
      </p>

      <h2>9. Changes to these rules</h2>
      <p>
        If the rules change in a way that matters, you'll see a note in the app and be asked to accept them again.
      </p>

      <h2>10. Law</h2>
      <p>German law applies.</p>
      <p>How your data is handled is explained in the {linkTo('privacy', 'privacy notice')}.</p>
    </div>
  )
}
