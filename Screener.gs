const SCREENER_LABEL_NAME = "Screener";
const BATCH_SIZE = 100;
const ORIGINAL_FROM_HEADER_NAME = "X-Original-From";
const IN_REPLY_TO_HEADER_NAME = "In-Reply-To";
const AUTHENTICATION_RESULTS_HEADER = "Authentication-Results";
const X_ORIGINAL_AUTHENTICATION_RESULTS_HEADER = "X-Original-Authentication-Results";
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

// Always require `dmarc=pass` in Authentication-Results and/or X-Original-Authentication-Results (at least one
// of those headers must contain the pass token; if both are missing or neither has a pass, we do not act).
function headerHasDmarcPass(headerValue) {
  const s = (headerValue && String(headerValue).trim()) || "";
  if (!s) return false;
  return /(?:^|[\s;])dmarc=pass(?:\s|;|$)/.test(s.toLowerCase());
}

function getUnscreenedThreads() {
  return withRetry(
    () => GmailApp.search(`label:${SCREENER_LABEL_NAME} -in:inbox`, 0, BATCH_SIZE),
    "getUnscreenedThreads"
  );
}

function applyFilters(thread, firstMessage, lastMessage, screenerLabel) {
  if (!filters) return false;

  for (const filter of filters) {
    if (!matchesFilter(filter, firstMessage)) continue;

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
    return true;
  }

  return false;
}

function screenThread(thread, messages, screenerLabel) {
  if (!messages || thread.getMessageCount() === 0) {
    Logger.log(`No messages found for thread ${thread.getId()}`);
    return false;
  }

  const firstMessage = messages[0];
  const lastMessage = messages[messages.length - 1];

  const authResults = firstMessage.getHeader(AUTHENTICATION_RESULTS_HEADER) || "";
  const originalAuthResults = firstMessage.getHeader(X_ORIGINAL_AUTHENTICATION_RESULTS_HEADER) || "";
  if (!headerHasDmarcPass(authResults) && !headerHasDmarcPass(originalAuthResults)) {
    Logger.log(
      `No dmarc=pass in ${AUTHENTICATION_RESULTS_HEADER} or ${X_ORIGINAL_AUTHENTICATION_RESULTS_HEADER} for first message in thread ${thread.getId()}`
    );
    return false;
  }

  // For messages sent to a Google Group, we need to work with the 'original from'
  const fromField = firstMessage.getHeader(ORIGINAL_FROM_HEADER_NAME) || firstMessage.getFrom();
  const sender = extractEmail(fromField);

  if (applyFilters(thread, firstMessage, lastMessage, screenerLabel)) {
    return false;
  }

  if (isContact(sender)) {
    Logger.log(`${sender} is a contact, moving thread to inbox`);
    thread.moveToInbox();
    thread.removeLabel(screenerLabel);
    return true;
  }

  return false;
}

function archiveStaleScreenerThreads() {
  const threads = withRetry(
    () => GmailApp.search(`label:${SCREENER_LABEL_NAME} in:inbox`, 0, BATCH_SIZE),
    "archiveStaleScreenerThreads"
  );

  if (!threads || threads.length === 0) {
    return;
  }

  Logger.log(`Found ${threads.length} thread(s) in inbox with '${SCREENER_LABEL_NAME}' label, archiving for reprocessing`);

  threads.forEach((thread) => {
    try {
      thread.moveToArchive();
    } catch (error) {
      Logger.log(`Error archiving thread ${thread.getId()}: ${error.message}`);
    }
  });
}

function screenThreads(screenerLabel) {
  const threads = getUnscreenedThreads();

  if (!threads || threads.length === 0) {
    Logger.log("No unscreened threads found");
    return;
  }

  const allMessages = withRetry(
    () => GmailApp.getMessagesForThreads(threads),
    "getMessagesForThreads"
  );

  let movedThreads = 0;

  threads.forEach((thread, i) => {
    try {
      if (screenThread(thread, allMessages[i], screenerLabel)) {
        movedThreads++;
      }
    } catch (error) {
      Logger.log(`Error processing thread ${thread.getId()}: ${error.message}`);
    }
  });

  Logger.log(`Screened ${threads.length} threads, moved ${movedThreads} threads to inbox`);
}

function run() {
  const screenerLabel = withRetry(
    () => GmailApp.getUserLabelByName(SCREENER_LABEL_NAME) || GmailApp.createLabel(SCREENER_LABEL_NAME),
    "getScreenerLabel"
  );

  archiveStaleScreenerThreads();
  screenThreads(screenerLabel);
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

  email = email.toLowerCase();

  // Cache lookups for a bit to avoid People API rate limits
  const cacheKey = email;
  let cached = null;

  try {
    cached = CacheService.getUserCache().get(cacheKey);

    if (cached) {
      Logger.log(`Cached result for ${email}: ${cached}`);
      return cached === "true";
    }
  } catch (error) {
    Logger.log(`CacheService.get() error for ${email}: ${error.message}`);
  }

  Logger.log(`Checking if ${email} is a contact`);
  const contacts = getContactsForEmail(email);

  if (!contacts || contacts.length === 0) {
    Logger.log(`No contacts found for ${email}`);

    try {
      CacheService.getUserCache().put(cacheKey, "false", CACHE_DURATION_SECONDS);
    } catch (error) {
      Logger.log(`CacheService.put() error for ${email}: ${error.message}`);
    }

    return false;
  }

  const contact = contacts[0];
  const contactEmails = contact?.person?.emailAddresses || [];
  const isEmailInContacts = contactEmails.some((e) => email === e.value.toLowerCase());

  try {
    CacheService.getUserCache().put(cacheKey, isEmailInContacts.toString(), CACHE_DURATION_SECONDS);
  } catch (error) {
    Logger.log(`CacheService.put() error for ${email}: ${error.message}`);
  }

  return isEmailInContacts;
}
