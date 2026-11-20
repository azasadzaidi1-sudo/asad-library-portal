import { useCallback, useEffect, useState } from 'react'
import { formatDate } from '../lib/catalogue'
import {
  deleteReply,
  deleteReview,
  loadDiscussion,
  postReply,
  postReview,
  updateReply,
  updateReview,
} from '../lib/library'
import { canDelete, canEdit, orderReviews } from '../lib/reviews'
import ConfirmButton from './ConfirmButton'

// Reviews of one book, each with a single conversation of replies under it.
export default function Reviews({ book, member }) {
  const [reviews, setReviews] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [writing, setWriting] = useState(false)

  const reload = useCallback(
    () => loadDiscussion(book.id).then(setReviews).catch((e) => setError(e.message)),
    [book.id],
  )

  useEffect(() => {
    reload()
  }, [reload])

  // Runs a change, then reloads the discussion. Returns true if it worked.
  async function run(action) {
    setBusy(true)
    setError('')
    try {
      await action()
      await reload()
      return true
    } catch (e) {
      setError(e.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  if (!reviews) {
    return (
      <section className="dialog-section">
        <h3 className="reviews-title">Reviews</h3>
        {error
          ? <p className="form-error" role="alert">{error}</p>
          : <p className="dialog-loading">Gathering what people thought…</p>}
      </section>
    )
  }

  const hasMine = reviews.some((r) => r.member_id === member.id)

  return (
    <section className="dialog-section reviews" aria-labelledby="reviews-title">
      <div className="reviews-head">
        <h3 id="reviews-title" className="reviews-title">
          Reviews{reviews.length > 0 && ` (${reviews.length})`}
        </h3>
        {!hasMine && !writing && (
          <button type="button" className="button button-quiet button-small" onClick={() => setWriting(true)}>
            Write a review
          </button>
        )}
      </div>

      {writing && (
        <PostForm
          withSpoilers
          label="Your review"
          submitLabel="Post review"
          busy={busy}
          onCancel={() => setWriting(false)}
          onSubmit={async (body, spoilers) => {
            if (await run(() => postReview(book.id, member.id, body, spoilers))) setWriting(false)
          }}
        />
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      {reviews.length === 0 && !writing && (
        <p className="panel-empty">No reviews yet. If you've read it, tell the others what you thought.</p>
      )}

      <ol className="review-list">
        {orderReviews(reviews, member.id).map((review) => (
          <Review key={review.id} review={review} member={member} busy={busy} run={run} />
        ))}
      </ol>
    </section>
  )
}

function Review({ review, member, busy, run }) {
  const [editing, setEditing] = useState(false)
  const [replying, setReplying] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const mine = review.member_id === member.id
  const hidden = review.has_spoilers && !revealed && !mine

  return (
    <li className="review">
      <PostMeta post={review}>
        {review.borrowed && <span className="badge">Borrowed from the library</span>}
      </PostMeta>

      {editing ? (
        <PostForm
          withSpoilers
          label="Your review"
          initialBody={review.body}
          initialSpoilers={review.has_spoilers}
          submitLabel="Save changes"
          busy={busy}
          onCancel={() => setEditing(false)}
          onSubmit={async (body, spoilers) => {
            if (await run(() => updateReview(review.id, body, spoilers))) setEditing(false)
          }}
        />
      ) : hidden ? (
        <button type="button" className="spoiler" onClick={() => setRevealed(true)}>
          This review contains spoilers. Show it anyway
        </button>
      ) : (
        <p className="post-body">
          {review.has_spoilers && <span className="spoiler-tag">Contains spoilers. </span>}
          {review.body}
        </p>
      )}

      {!editing && (
        <div className="post-actions">
          <button type="button" className="link-button" onClick={() => setReplying(!replying)}>
            Reply
          </button>
          {canEdit(review, member) && (
            <button type="button" className="link-button" onClick={() => setEditing(true)}>Edit</button>
          )}
          {canDelete(review, member) && (
            <ConfirmButton label="Delete" question="Delete this review and its replies?" confirmLabel="Delete"
              busy={busy} onConfirm={() => run(() => deleteReview(review.id))} />
          )}
        </div>
      )}

      {(review.replies.length > 0 || replying) && (
        <ul className="reply-list">
          {review.replies.map((reply) => (
            <Reply key={reply.id} reply={reply} member={member} busy={busy} run={run} />
          ))}
          {replying && (
            <li>
              <PostForm
                label="Your reply"
                submitLabel="Post reply"
                busy={busy}
                onCancel={() => setReplying(false)}
                onSubmit={async (body) => {
                  if (await run(() => postReply(review.id, member.id, body))) setReplying(false)
                }}
              />
            </li>
          )}
        </ul>
      )}
    </li>
  )
}

function Reply({ reply, member, busy, run }) {
  const [editing, setEditing] = useState(false)

  return (
    <li className="reply">
      <PostMeta post={reply} />
      {editing ? (
        <PostForm
          label="Your reply"
          initialBody={reply.body}
          submitLabel="Save changes"
          busy={busy}
          onCancel={() => setEditing(false)}
          onSubmit={async (body) => {
            if (await run(() => updateReply(reply.id, body))) setEditing(false)
          }}
        />
      ) : (
        <>
          <p className="post-body">{reply.body}</p>
          {(canEdit(reply, member) || canDelete(reply, member)) && (
            <div className="post-actions">
              {canEdit(reply, member) && (
                <button type="button" className="link-button" onClick={() => setEditing(true)}>Edit</button>
              )}
              {canDelete(reply, member) && (
                <ConfirmButton label="Delete" question="Delete this reply?" confirmLabel="Delete"
                  busy={busy} onConfirm={() => run(() => deleteReply(reply.id))} />
              )}
            </div>
          )}
        </>
      )}
    </li>
  )
}

function PostMeta({ post, children }) {
  return (
    <p className="post-meta">
      <span className="post-author">{post.author}</span>
      {children}
      <span className="post-date">
        {formatDate(post.created_at)}
        {post.edited_at && ', edited'}
      </span>
    </p>
  )
}

function PostForm({ label, initialBody = '', initialSpoilers = false, withSpoilers, submitLabel, busy, onSubmit, onCancel }) {
  const [body, setBody] = useState(initialBody)
  const [spoilers, setSpoilers] = useState(initialSpoilers)

  return (
    <form
      className="post-form"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(body, spoilers)
      }}
    >
      <label>
        {label}
        <textarea rows={withSpoilers ? 4 : 2} maxLength={withSpoilers ? 4000 : 2000} required
          value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      {withSpoilers && (
        <label className="checkbox">
          <input type="checkbox" checked={spoilers} onChange={(e) => setSpoilers(e.target.checked)} />
          Contains spoilers (hidden until a reader chooses to see it)
        </label>
      )}
      <div className="post-actions">
        <button type="submit" className="button button-small" disabled={busy || !body.trim()}>
          {submitLabel}
        </button>
        <button type="button" className="link-button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
