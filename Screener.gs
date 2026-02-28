const SCREENER_LABEL_NAME = "Screener";
const BATCH_SIZE = 100;
const ORIGINAL_FROM_HEADER_NAME = "X-Original-From";
const IN_REPLY_TO_HEADER_NAME = "In-Reply-To";
const SOURCE_TYPE_CONTACT = "READ_SOURCE_TYPE_CONTACT";
const CACHE_DURATION_SECONDS = 25 * 60; // 25 minutes
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_SECONDS = 1;

function withRetry(operation, operationName = "", maxAttempts = RETRY_MAX_ATTEMPTS, baseDelaySeconds = RETRY_BASE_DELAY_SECONDS) {
  const logPrefix = operationName ? `[${operationName}] ` : "";
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return operation();
    } catch (error) {
      if (i === maxAttempts - 1) {
        Logger.log(`${logPrefix}Max retries (${maxAttempts}) exceeded. Last error: ${error.message}`);
        throw error;
      }
      Logger.log(`${logPrefix}Retry ${i + 1}/${maxAttempts} after error: ${error.message}`);
      Utilities.sleep(baseDelaySeconds * 2 ** i * 1000);
    }
  }
}

function getUnscreenedThreads() {
  return withRetry(
    () => GmailApp.search(`label:${SCREENER_LABEL_NAME} -in:inbox`, 0, BATCH_SIZE),
    "getUnscreenedThreads"
  );
}

function processThreads() {
  const screenerLabel = withRetry(
    () => GmailApp.getUserLabelByName(SCREENER_LABEL_NAME) || GmailApp.createLabel(SCREENER_LABEL_NAME),
    "getScreenerLabel"
  );
  const threads = getUnscreenedThreads();

  if (!threads || threads.length === 0) {
    Logger.log("No unscreened threads found");
    return;
  }

  let movedThreads = 0;

  threads.forEach((thread) => {
    const messages = thread.getMessages();
    const messageCount = thread.getMessageCount();

    if (!messages || messageCount === 0) {
      Logger.log(`No messages found for thread ${thread.getId()}`);
      return;
    }

    const firstMessage = messages[0];
    const lastMessage = messages[messageCount - 1];

    // For messages sent to a Google Group, we need to work with the 'original from'
    const fromField = firstMessage.getHeader(ORIGINAL_FROM_HEADER_NAME) || firstMessage.getFrom();
    const sender = extractEmail(fromField);

    let filterMatched = false;

    if (filters) {
      for (const filter of filters) {
        if (matchesFilter(filter, firstMessage)) {
          Logger.log(`Filter matched for: '${firstMessage.getSubject()}'`);

          if (filter.forwardTo) {
            if (lastMessage.getHeader(IN_REPLY_TO_HEADER_NAME)) {
              Logger.log(`'${IN_REPLY_TO_HEADER_NAME}' header found, not forwarding to prevent loop`)
            } else {
              Logger.log(`Forwarding to: '${filter.forwardTo}'`);
              firstMessage.forward(filter.forwardTo);
            }
          }
          if (filter.shouldMarkAsRead) {
            Logger.log(`Marking thread as read`);
            thread.markRead();
          }
          if (filter.shouldArchive) {
            Logger.log("Moving thread to archive");
            thread.moveToArchive();
          }

          Logger.log(`Removing '${SCREENER_LABEL_NAME}' label`);
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
  const searchResponse = withRetry(
    () =>
      People.People.searchContacts({
        query: email,
        readMask: "emailAddresses",
        sources: [SOURCE_TYPE_CONTACT],
      }),
    "getContactsForEmail",
  );

  return searchResponse.results || [];
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
  let cached = null;

  try {
    cached = CacheService.getUserCache().get(cacheKey);

    if (cached) {
      Logger.log(`Cached result for ${email}: ${cached}`);
      return cached === "true";
    }
  } catch (error) {
    Logger.log(`CacheService.get() error for ${email}: ${error.message}`);
    throw error;
  }

  Logger.log(`Checking if ${email} is a contact`);
  const contacts = getContactsForEmail(email);

  if (!contacts || contacts.length === 0) {
    Logger.log(`No contacts found for ${email}`);

    try {
      CacheService.getUserCache().put(cacheKey, "false", CACHE_DURATION_SECONDS);
    } catch (error) {
      Logger.log(`CacheService.put() error for ${email}: ${error.message}`);
      throw error;
    }

    return false;
  }

  const contact = contacts[0];
  const contactEmails = contact.person.emailAddresses || [];
  const isEmailInContacts = contactEmails.some((e) => email.toLowerCase() === e.value.toLowerCase());

  try {
    CacheService.getUserCache().put(cacheKey, isEmailInContacts.toString(), CACHE_DURATION_SECONDS);
  } catch (error) {
    Logger.log(`CacheService.put() error for ${email}: ${error.message}`);
    throw error;
  }

  return isEmailInContacts;
}
