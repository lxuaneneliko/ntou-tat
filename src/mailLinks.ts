export type MailTextToken =
  | { type: 'text'; value: string }
  | { type: 'link'; href: string; value: string }

const LINK_PATTERN = /(?:https?:\/\/|mailto:|tel:)[^\s<>"']+/gi
const TRAILING_PUNCTUATION = /[.,;!?，。；！？]+$/

export const mailTextTokens = (body: string): MailTextToken[] => {
  const tokens: MailTextToken[] = []
  let cursor = 0

  for (const match of body.matchAll(LINK_PATTERN)) {
    const start = match.index
    const raw = match[0]
    const link = raw.replace(TRAILING_PUNCTUATION, '')
    const trailing = raw.slice(link.length)
    if (start > cursor) tokens.push({ type: 'text', value: body.slice(cursor, start) })
    if (link) tokens.push({ type: 'link', href: link, value: link })
    if (trailing) tokens.push({ type: 'text', value: trailing })
    cursor = start + raw.length
  }

  if (cursor < body.length) tokens.push({ type: 'text', value: body.slice(cursor) })
  return tokens.length ? tokens : [{ type: 'text', value: body }]
}
