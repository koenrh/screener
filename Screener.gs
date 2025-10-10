const SCREENER_LABEL_NAME = "Screener";
const BATCH_SIZE = 100;
const ORIGINAL_FROM_HEADER_NAME = "X-Original-From";
const SOURCE_TYPE_CONTACT = "READ_SOURCE_TYPE_CONTACT";
const CACHE_DURATION_SECONDS = 25 * 60; // 25 minutes

function getUnscreenedThreads() {
  try {
    return GmailApp.search(`label:${SCREENER_LABEL_NAME} -in:inbox`, 0, BATCH_SIZE);
  } catch(error) {
    Logger.log(`Error getting unscreened threads: ${error.message}`);
    throw error;
  }
}

function processThreads() {
  const screenerLabel = GmailApp.getUserLabelByName(SCREENER_LABEL_NAME) || GmailApp.createLabel(SCREENER_LABEL_NAME);
  const threads = getUnscreenedThreads();

  if (!threads || threads.length === 0) {
    Logger.log("No unscreened threads found");
    return;
  }

  let movedThreads = 0;

  threads.forEach((thread) => {
    const messages = thread.getMessages();

    if (!messages || messages.length === 0) {
      Logger.log(`No messages found for thread ${thread.getId()}`);
      return;
    }

    const firstMessage = messages[0];

    // For messages sent to a Google Group, we need to work with the 'original from'
    const fromField = firstMessage.getHeader(ORIGINAL_FROM_HEADER_NAME) || firstMessage.getFrom();
    const sender = extractEmail(fromField);

    let filterMatched = false;

    if (filters) {
      for (const filter of filters) {
        if (matchesFilter(filter, firstMessage)) {
          Logger.log(`Filter matched for: '${firstMessage.getSubject()}'`);

          if (filter.forwardTo) {
            Logger.log(`Forwarding to: '${filter.forwardTo}'`);
            firstMessage.forward(filter.forwardTo);
          }
          if (filter.shouldMarkAsRead) {
            Logger.log(`Marking thread as read`);
            thread.markRead();
          }
          if (filter.shouldArchive) {
            Logger.log("Moving thread to archive");
            thread.moveToArchive();
          }

          thread.removeLabel(screenerLabel);
          filterMatched = true;
          break;
        }
      }
    }

    if (!filterMatched && isContact(sender)) {
      Logger.log(`${sender} is a contact, moving thread to inbox`);

      movedThreads++;

      thread.removeLabel(screenerLabel);
      thread.moveToInbox();
    }
  });

  Logger.log(`Screened ${threads.length} threads, moved ${movedThreads} threads to inbox`);
}

function getContactsForEmail(email) {
  try {
    const searchResponse = People.People.searchContacts({
      query: email,
      readMask: "emailAddresses",
      sources: [SOURCE_TYPE_CONTACT],
    });

    return searchResponse.results || [];

  } catch (error) {
    if (error.message.startsWith("Exception:") && error.message.includes("Empty response")) {
      return [];

    } else {
      Logger.log(`Error getting contacts for ${email}: ${error.message}`);
      throw error;
    }
  }
}

function extractEmail(addressField) {
  if (!addressField || typeof addressField !== "string") return "";
  const matches = addressField.match(/<([^<>]+)>/);
  return matches ? matches[1] : addressField.trim();
}

function isContact(email) {
  if (!email || typeof email !== "string") {
    Logger.log(`Invalid email: ${email}`);
    return false;
  }

  // Cache lookups for a bit to avoid People API rate limits
  const cacheKey = email.toLowerCase();
  const cached = CacheService.getUserCache().get(cacheKey);

  if (cached) {
    Logger.log(`Cached result for ${email}: ${cached}`);
    return cached === "true";
  }

  Logger.log(`Checking if ${email} is a contact`);
  const contacts = getContactsForEmail(email);

  if (!contacts || contacts.length === 0) {
    Logger.log(`No contacts found for ${email}`);
    CacheService.getUserCache().put(cacheKey, "false", CACHE_DURATION_SECONDS);
    return false;
  }

  const contact = contacts[0];
  const contactEmails = contact.person.emailAddresses || [];
  const isEmailInContacts = contactEmails.some((e) => email.toLowerCase() === e.value.toLowerCase());

  CacheService.getUserCache().put(cacheKey, isEmailInContacts.toString(), CACHE_DURATION_SECONDS);

  return isEmailInContacts;
}
