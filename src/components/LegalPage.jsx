import { useContactDetails } from '../lib/account'
import PrivacyNotice from './PrivacyNotice'
import HouseRules from './HouseRules'

// The privacy notice or the house rules as a page inside the app (#privacy,
// #rules), for signed-in members. Reached from the footer and the Account page.
export default function LegalPage({ which }) {
  const contact = useContactDetails()
  const linkTo = (page, label) => <a href={`#${page}`}>{label}</a>
  return (
    <div className="legal-page">
      <h1 className="page-title">{which === 'privacy' ? 'Privacy notice' : 'House rules'}</h1>
      {which === 'privacy'
        ? <PrivacyNotice contact={contact} linkTo={linkTo} />
        : <HouseRules contact={contact} linkTo={linkTo} />}
    </div>
  )
}
