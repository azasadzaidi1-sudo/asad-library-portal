import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Fonts are bundled with the site instead of loaded from Google, so no
// visitor data goes to a third party (see docs/decisions.md).
import '@fontsource/im-fell-english/400.css'
import '@fontsource/im-fell-english/400-italic.css'
import '@fontsource/alegreya-sans/400.css'
import '@fontsource/alegreya-sans/400-italic.css'
import '@fontsource/alegreya-sans/700.css'
import './styles.css'

import App from './App'
import { followNotificationTaps } from './lib/push'

// Tapping a notification while the app is open shows the right page.
followNotificationTaps()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
