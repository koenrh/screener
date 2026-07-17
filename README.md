# Screener for Gmail

Screener is a Google Apps Script that keeps your inbox clean by only allowing messages
from verified contacts to reach it.

Incoming mail is archived under a `Screener` label. On each run the script:

1. Moves threads from known contacts to the inbox (and removes the label)
1. Applies optional custom filters (forward, mark as read, archive)
1. Leaves everything else under `Screener` for you to review

## Create Gmail filter

1. In Gmail, create a label named `Screener`
1. Search for `to:me`
1. Open the search options and click **Create filter**
1. Check **Skip the Inbox (Archive it)**
1. Check **Apply the label** and select `Screener`
1. Click **Create filter**

## Create script

1. Open [Google Apps Script](https://script.google.com/home) and create a new project
1. Paste the contents of `Screener.gs` into the editor (replace any default code)
1. Add a second file named `Filters.gs` and paste its contents (edit or clear the
   example filters for your own use)
1. Enable the **Gmail API** and **People API** advanced services
   (Services → Add service)
1. Run `run` once and approve the OAuth prompts (Gmail and Contacts access)
1. Add a time-driven trigger: Triggers → Add trigger → function `run` →
   time-driven → every 5 minutes

You can also copy [`appsscript.json`](appsscript.json) into the project
(View → Show manifest file) so the advanced services are declared up front.

## Workflow

Review messages labeled `Screener`. To allow future mail from a sender into your
inbox, add them as a [contact](https://contacts.google.com/).

## Filters

`Filters.gs` defines rules matched against the first message in a thread.

Match fields (`%` is a wildcard):

- `fromEmail`
- `toName`
- `subject`
- `headers`

Actions:

- `forwardTo`
- `shouldMarkAsRead`
- `shouldArchive`

### Examples

```js
const filters = [
  // Forward mailinglist messages to Slack
  {
    subject: "[security]%",
    headers: {
      "X-Google-Group-Id": "1000000000000"
    },
    forwardTo: "notif-foo-bar@baz.slack.com",
    shouldMarkAsRead: true,
    shouldArchive: true
  },
  // Forward Stripe invoices to Ramp
  {
    fromEmail: "invoice+statements+%@stripe.com",
    forwardTo: "receipts@ramp.com",
    shouldMarkAsRead: true,
    shouldArchive: true
  },
  // Archive certain npm notifications
  {
    fromEmail: "support@npmjs.com",
    subject: "Successfully published%",
    shouldMarkAsRead: true,
    shouldArchive: true
  }
]
```
