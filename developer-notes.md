## Feb 24th 2025

- I need to fix the bug that prevents the whole function from running
    - Sonnet3.7 says the same thing GPT was saying: the Notion SDK version is conflicting with Deno
    - Sonnet rewrote it making a call directly to the Notion API and this seems to work 

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
