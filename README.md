# Screener for Gmail

Inspired by [Hey](https://www.hey.com/features/the-screener/), Screener is a simple
Google Apps Script script that helps you to keep your inbox clean by only allowing
messages from verified contacts to reach your inbox.

## Create filter

1. Open Gmail and search for `to:me`
1. Click the search options icon
1. Click 'Create filter'
1. Check 'Skip the Inbox (Archive it)'
1. Check 'Apply the label' and select 'Screener'
1. Click 'Create filter'

## Create script

1. Open [Google Apps Script](https://script.google.com/home)
1. Create new project
1. Copy and paste the contents of `Screener.gs` in the editor
1. Create a time-based trigger that runs `processMessages` every 5 minutes

## Workflow

At least once a day, I review the messages tagged 'Screener'. If I want messages
from the sender to reach my inbox, I add them as a [contact](https://contacts.google.com/).
