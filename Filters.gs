const filters = [
  {
    subject: "[security]%",
    headers: {
      "X-Google-Group-Id": "1000000000000"
    },
    forwardTo: "notif-foo-bar@baz.slack.com",
    shouldMarkAsRead: true,
    shouldArchive: true
  },
  {
    fromEmail: "invoice+statements+%@stripe.com",
    forwardTo: "receipts@ramp.com",
    shouldMarkAsRead: true,
    shouldArchive: true
  },
  {
    fromEmail: "sc-noreply@google.com",
    subject: "%issues detected for%",
    shouldMarkAsRead: true,
    shouldArchive: true
  },
  {
    fromEmail: "support@npmjs.com",
    subject: "Successfully published%",
    shouldMarkAsRead: true,
    shouldArchive: true
  }
]

function matchesFilter(filter, message) {
  if (!filter.fromEmail && !filter.toName && !filter.subject && !filter.headers) {
    return false;
  }

  const toField = message.getTo();
  const fromField = message.getHeader(ORIGINAL_FROM_HEADER_NAME) || message.getFrom();
  const fromEmail = extractEmail(fromField);
  const subject = message.getSubject();

  if (filter.fromEmail && !matchesWildcard(filter.fromEmail, fromEmail)) {
    return false;
  }

  // TODO: Properly parse 'To' field to extract recipients names and emails
  if (filter.toName && !matchesWildcard(filter.toName, toField)) {
    return false;
  }

  if (filter.subject && !matchesWildcard(filter.subject, subject)) {
    return false;
  }

  if (filter.headers) {
    for (const header in filter.headers) {
      if (!matchesWildcard(filter.headers[header], message.getHeader(header))) {
        return false;
      }
    }
  }

  return true;
}

function matchesWildcard(pattern, text) {
  if (!pattern || !text) return false;

  const segments = pattern.split('%');

  if (segments.length === 1) {
    return pattern.toLowerCase() === text.toLowerCase();
  }

  let textIndex = 0;
  const textLower = text.toLowerCase();

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i].toLowerCase();

    if (segment === "") continue;

    if (i === 0) {
      if (!textLower.startsWith(segment)) return false;
      textIndex = segment.length;

    } else if (i === segments.length - 1) {
      if (!textLower.endsWith(segment)) return false;
      if (textIndex > textLower.length - segment.length) return false;

    } else {
      const foundIndex = textLower.indexOf(segment, textIndex);
      if (foundIndex === -1) return false;
      textIndex = foundIndex + segment.length;
    }
  }

  return true;
}
