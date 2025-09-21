const SCREENER_LABEL_NAME = "Screener";
const BATCH_SIZE = 100;
const ORIGINAL_FROM_HEADER_NAME = "X-Original-From";
const SOURCE_TYPE_CONTACT = "READ_SOURCE_TYPE_CONTACT";

function processMessages() {
  const screenerLabel = GmailApp.getUserLabelByName(SCREENER_LABEL_NAME) || GmailApp.createLabel(SCREENER_LABEL_NAME);
  const threads = GmailApp.search(`label:${SCREENER_LABEL_NAME} -in:inbox`, 0, BATCH_SIZE);

  threads.forEach((thread) => {
    const firstThread = thread.getMessages()[0];

    // For messages sent to a Google Group, we need to work with the 'original from'
    const fromField = firstThread.getHeader(ORIGINAL_FROM_HEADER_NAME) || firstThread.getFrom();
    const sender = extractEmail(fromField);

    if (isContact(sender)) {
      Logger.log(`${sender} is a contact, moving thread to inbox`);

      thread.removeLabel(screenerLabel);
      thread.markUnread();
      thread.moveToInbox();
    }
  });

  Logger.log(`Processed ${threads.length} threads`);
}

function isContact(email) {
  const searchResponse = People.People.searchContacts({
    query: email,
    readMask: "emailAddresses",
    sources: [SOURCE_TYPE_CONTACT],
  });

  const contacts = searchResponse.results || [];

  if (contacts.length === 0) {
    Logger.log(`No contacts found for: ${email}`);
    return false;
  }

  const contact = contacts[0];
  const contactEmails = contact.person.emailAddresses || [];

  return contactEmails.some((e) => email.toLowerCase() === e.value.toLowerCase());
}

function extractEmail(fromField) {
  var matches = fromField.match(/<(.+)>/);
  return matches ? matches[1] : fromField;
}
