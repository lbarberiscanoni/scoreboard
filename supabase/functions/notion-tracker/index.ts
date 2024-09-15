import { serve } from 'https://deno.land/x/sift/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Client as NotionClient } from 'https://esm.sh/@notionhq/client';
import 'https://deno.land/x/dotenv/load.ts';

// Supabase setup using environment variables
const supabaseUrl = Deno.env.get('SUPA_URL');
const supabaseKey = Deno.env.get('SUPA_KEY');
const supabase = createClient(supabaseUrl, supabaseKey);

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

      const checkboxBlocks = blocks.filter((block) => block.type === 'to_do');
      console.log("Checkbox Blocks:", checkboxBlocks);

      for (const checkboxBlock of checkboxBlocks) {
        const checkboxValue = checkboxBlock.to_do.checked;

        // Extract the user ID from block metadata
        const userId = checkboxBlock.last_edited_by?.id || checkboxBlock.created_by?.id;
        let authorName = "Unknown User";

        // If a user ID is found, fetch the user's name
        if (userId) {
          authorName = await getNotionUserName(notion, userId);
          console.log('Fetched Author Name:', authorName);
        }

        // Fetch the last event for this page/block from Supabase to check for changes
        const { data: lastEvent, error: lastEventError } = await supabase
          .from('events')
          .select('details')
          .eq('input_type_id', 1) // Updated to use 'input_type_id' instead of 'type_id'
          .eq('org_id', orgId)  // Ensure it matches the correct organization
          .order('timestamp', { ascending: false })
          .limit(1)
          .single();

        if (lastEventError) {
          console.error('Error fetching last event:', lastEventError);
        } else {
          const lastCheckboxValue = lastEvent?.details ? JSON.parse(lastEvent.details).checkbox_value : null;

          if (lastCheckboxValue !== checkboxValue) {
            // Log the checkbox event data into the "events" table with the author's username
            const { data, error } = await supabase.from('events').insert([
              {
                org_id: orgId,
                user_id: authorName, // Save the Notion username directly as the user_id
                input_type_id: 1, // Assuming 1 is the id for 'Notion' in input_types table
                timestamp: new Date().toISOString(),
                details: JSON.stringify({ page_id: pageId, checkbox_value: checkboxValue }),
              },
            ]);

            if (error) {
              console.error('Error logging checkbox event:', error);
            } else {
              console.log('Checkbox event logged with author:', authorName);
            }
          } else {
            console.log('Checkbox value unchanged, no event logged.');
          }
        }
      }
    }
  } catch (error) {
    console.error('Error tracking Notion pages:', error);
  }
}

// Poll every 10 seconds
setInterval(trackNotionPages, 10000);

serve(() => new Response('Server is running and polling Notion pages', { status: 200 }));