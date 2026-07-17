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
