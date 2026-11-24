// Plain helpers for reviews; kept apart from the database code so they're easy to test.

// Adds author names (and the review author's "borrowed" badge) to reviews and replies.
//   reviews: [{ member_id, replies: [{ member_id }] }]
//   people:  [{ member_id, name, borrowed }] from book_discussion_people()
export function attachAuthors(reviews, people) {
  const byId = new Map(people.map((p) => [p.member_id, p]))
  // No member at all: they deleted their account and the post stayed.
  const author = (id) => (id == null ? 'Former member' : byId.get(id)?.name || 'A new member')
  return reviews.map((review) => ({
    ...review,
    author: author(review.member_id),
    borrowed: Boolean(byId.get(review.member_id)?.borrowed),
    replies: [...(review.replies ?? [])]
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map((reply) => ({ ...reply, author: author(reply.member_id) })),
  }))
}

// Your own review of this book comes first, then everyone else's, newest first.
export function orderReviews(reviews, memberId) {
  const mine = reviews.filter((r) => r.member_id === memberId)
  return [...mine, ...reviews.filter((r) => r.member_id !== memberId)]
}

export function canEdit(post, member) {
  return post.member_id === member.id
}

// You can delete your own posts; the admin (Asad) can remove anything.
export function canDelete(post, member) {
  return post.member_id === member.id || Boolean(member.is_admin)
}
