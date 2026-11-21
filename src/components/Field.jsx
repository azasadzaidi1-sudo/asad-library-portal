// A labelled form field with an optional hint and error, used by the forms
// (Join, Add book, Describe your shelf).
export default function Field({ label, hint, error, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
      {error && <span className="form-error" role="alert">{error}</span>}
    </label>
  )
}
