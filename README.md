# counter-page

A self-contained NodeJS script that counts through the last 25-100 posts in the
/r/CountWithEveryone subreddit to see if continuity has been maintained.
The script retrieves the posts in a configured interval (default: 30).

## Installation
1. Install NodeJS 24 or higher if you have not yet.
2. Clone this repository.
3. `node install`
4. Run the script with something like PM2 and reverse proxy to it if needed.