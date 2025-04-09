## Apr 8th 2025

- ok the focus for today is figuring out why Cassandra isn't tracking
    - let's give it to Claude so that it's up to date in understanding the lates version of the codebase
    - ok actually it seems to work on the Scoreboard page I just setup
        - except it's over-writing too many events
            - ok it appeasr to be fixed with the original page I tested with 

- let's test it with another page
    - unforutnatley I can only test wiht my own account, so I need somebody else to try it at the next meeting lol 
    - initially it didn't track this because I forgot to add the Snapshot logger
        - interestingly enough it seems that it tracks even the pages inside it
            - worth testing later because it would simplify things a great deal because I can just create 1 page to track all ToDos and it's all done with subpages for each person 

- I forgot how to deploy it
    - `supabase functions deploy notion-tracker` is the command

- then code + notion = "touch-points" 
    - ok this worked! 
    - let's take a moment to back-populate the data 

- I kind would like it if when I add a new repo to be tracked on Supabase, we automatically pull all the commits from that repo and log them into our Events. 
    - The main component is the github-import edge function that:
        - Takes a repository name and organization ID as input
        - Fetches up to 300 commits (3 pages) from the GitHub API
        - Filters to include only commits from the last 60 days to match your frontend view
        - Checks for users with matching GitHub usernames in your database
        - Adds the commits as events in your database, avoiding duplicates
        - Returns a summary of how many commits were imported
    - jk, let's just trigger the pull of the commit history once github-tracker receivess the first webhook event

- we also need to figure out why Supabase "usage" limits are happening

- let's add instructions to the read me
    - [ ] how to add Notion pages
    - [ ] how to add Github repos

## Feb 28th 2025

Ok now the scoreboard displays the # of commmits or checkboxes in the last week 

## Feb 24th 2025

- I need to fix the bug that prevents the whole function from running
    - Sonnet3.7 says the same thing GPT was saying: the Notion SDK version is conflicting with Deno
    - Sonnet rewrote it making a call directly to the Notion API and this seems to work 
- ok wow whatever it was it just worked!! 
    - I tested it with Mit and now the scoreboard tracks everyone! 

## Feb 18th 2025

- The key thing today is just to write out how I do the testing
    1. run `deno run --allow-env --allow-net index.ts` from `notion-tracker` directory
    - just kidding, we can't do locally because of the local variables BS
- we push to prod with `supabase functions deploy notion-tracker` 
    - currently not working because I need to `supabase login` but my supabase CLI is too old
    - now that I've updated it, I need to download Docker again
        - ok that worked, but I had to download it manulaly as opposed to using Homebrew because apparently the cask is not compatible with M2
- Right now I'm testing at this page (https://www.notion.so/Scoreboard-17cadf1251e6800ea28ed60e850124a2)
- this is where the error comes up 
    - 'Error tracking Notion pages: TypeError: Cannot read properties of undefined (reading 'call')
    at e.request (https://esm.sh/@notionhq/client@2.2.16/es2022/client.mjs:4:16076)
    at Object.list (https://esm.sh/@notionhq/client@2.2.16/es2022/client.mjs:4:11580)
    at trackNotionPages (file:///Users/lbarberiscanoni/Lorenzo/Github/scoreboard/supabase/functions/notion-tracker/index.ts:57:53)
    at eventLoopTick (ext:core/01_core.js:168:7)'
    - The error perists even if I stablize the version to 2.15.5 or whatever, so I need to focus on more detailed logging
