import { serve } from 'https://deno.land/x/sift/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Client as NotionClient } from 'https://esm.sh/@notionhq/client';
import 'https://deno.land/x/dotenv/load.ts';

console.log('Function started');

// Supabase setup using environment variables
const supabaseUrl = Deno.env.get('SUPA_URL');
const supabaseKey = Deno.env.get('SUPA_KEY');
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key:', supabaseKey);

// Function to retrieve user details from Notion API
async function getNotionUserName(notionClient, userId) {
  try {
    const userResponse = await notionClient.users.retrieve({ user_id: userId });
    return userResponse.name || userResponse.bot?.owner?.user?.name || "Unknown User";
  } catch (error) {
    console.error('Error fetching user details from Notion:', error);
    return "Unknown User";
  }
}

async function trackNotionPages() {
  try {
    console.log('Polling for changes in Notion pages...');

    // Fetch the list of active Notion pages and corresponding organization info from Supabase
    const { data: notionPages, error: pagesError } = await supabase
      .from('notion_pages')
      .select('id, page_id, org_id')
      .eq('is_active', true);

    if (pagesError) {
      console.error('Error fetching Notion pages:', pagesError);
      return;
    }

    if (!notionPages || notionPages.length === 0) {
      console.log('No active Notion pages found.');
      return;
    }

    for (const page of notionPages) {
      const pageId = page.page_id;
      const orgId = page.org_id;

      // Fetch Notion API key for the organization
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('notion_api_key')
        .eq('id', orgId)
        .single();

      if (orgError) {
        console.error('Error fetching organization data:', orgError);
        continue;
      }

      const notionApiKey = orgData.notion_api_key;
      if (!notionApiKey) {
        console.error(`No Notion API key found for organization ID ${orgId}`);
        continue;
      }

      // Initialize Notion client with the organization's API key
      const notion = new NotionClient({ auth: notionApiKey });

      // Fetch blocks from Notion for the given page
      const response = await notion.blocks.children.list({ block_id: pageId });
      const blocks = response.results;

      // Filter to-do (checkbox) blocks
      const checkboxBlocks = blocks.filter((block) => block.type === 'to_do');
      console.log("Checkbox Blocks:", checkboxBlocks);

      for (const checkboxBlock of checkboxBlocks) {
        const checkboxValue = checkboxBlock.to_do.checked; // Get the checkbox value
        const blockId = checkboxBlock.id; // Unique ID for each checkbox block

        // Skip logging if the checkbox is unchecked
        if (!checkboxValue) {
          continue; // Do nothing if the checkbox is not checked
        }

        // Extract the user ID from block metadata
        const userId = checkboxBlock.last_edited_by?.id || checkboxBlock.created_by?.id;
        let authorName = "Unknown User";

        // If a user ID is found, fetch the user's name
        if (userId) {
          authorName = await getNotionUserName(notion, userId);
          console.log('Fetched Author Name:', authorName);

          // Check if the user already exists in the Users table
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id, notion_username')
            .eq('notion_username', authorName)
            .single();

          let userIdForEvent;

          if (userError || !userData) {
            // User does not exist, insert new user
            const { data: newUser, error: newUserError } = await supabase.from('users').insert([
              {
                org_id: orgId,
                notion_username: authorName,
              },
            ]).select('*').single();

            if (newUserError) {
              console.error('Error inserting new user:', newUserError);
              continue;
            } else {
              userIdForEvent = newUser.id;
            }
          } else {
            // User exists, use existing user ID
            userIdForEvent = userData.id;
          }

          // Fetch all events without any filters to debug data structure
          const { data: allEvents, error: allEventsError } = await supabase
            .from('events')
            .select('details');

          if (allEventsError) {
            console.error('Error fetching all events:', allEventsError);
          } else {
            // Filter out events with null details
            const validEvents = allEvents.filter(event => event.details !== null);

            // Check if there is a matching event with the same block_id
            const matchingEvent = validEvents.find(event => {
              const details = JSON.parse(event.details);
              return details.block_id === blockId;
            });

            if (!matchingEvent) {
              console.log('No matching event found. Logging the current state.');
              // No previous event found, log this as a new event
              const { data, error } = await supabase.from('events').insert([
                {
                  org_id: orgId,
                  user_id: userIdForEvent,
                  input_type_id: 1, // Assuming 1 is the id for 'Notion' in input_types table
                  timestamp: new Date().toISOString(),
                  details: JSON.stringify({ page_id: pageId, block_id: blockId, checkbox_value: checkboxValue }), // Include block_id in details
                },
              ]);

              if (error) {
                console.error('Error logging new checkbox event:', error);
              } else {
                console.log('New checkbox event logged with user ID:', userIdForEvent);
              }
            } else {
              console.log('Matching event found, no new event logged.');
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error tracking Notion pages:', error);
  }
}

// Execute the function immediately when triggered
trackNotionPages();