import { serve } from 'https://deno.land/x/sift/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import 'https://deno.land/x/dotenv/load.ts';

console.log('Function started');

// Supabase setup using environment variables
const supabaseUrl = Deno.env.get('SUPA_URL');
const supabaseKey = Deno.env.get('SUPA_KEY');
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key:', supabaseKey);

// Function to make direct calls to Notion API instead of using the SDK
async function notionRequest(endpoint, options, apiKey) {
  const url = `https://api.notion.com/v1${endpoint}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Notion API error: ${response.status} ${response.statusText}`, error);
    throw new Error(`Notion API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Function to retrieve user details from Notion API
async function getNotionUserName(apiKey, userId) {
  try {
    const userResponse = await notionRequest(`/users/${userId}`, { method: 'GET' }, apiKey);
    return userResponse.name || (userResponse.bot?.owner?.user?.name) || "Unknown User";
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

      console.log("Attempting to list children for pageId:", pageId);

      try {
        // Direct API call to get block children
        const response = await notionRequest(`/blocks/${pageId}/children`, { method: 'GET' }, notionApiKey);
        console.log("Response from blocks.children.list:", JSON.stringify(response, null, 2));
        
        const blocks = response.results;
        const checkboxBlocks = blocks.filter((block) => block.type === 'to_do');
        console.log("Checkbox Blocks:", checkboxBlocks);

        for (const checkboxBlock of checkboxBlocks) {
          // The structure may be different with direct API
          const checkboxValue = checkboxBlock.to_do.checked;
          const blockId = checkboxBlock.id;

          // Skip logging if the checkbox is unchecked
          if (!checkboxValue) {
            continue;
          }

          // Extract the user ID from block metadata
          const userId = checkboxBlock.last_edited_by?.id || checkboxBlock.created_by?.id;
          let authorName = "Unknown User";

          if (userId) {
            authorName = await getNotionUserName(notionApiKey, userId);
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
              const { data: newUser, error: newUserError } = await supabase
                .from('users')
                .insert([{ org_id: orgId, notion_username: authorName }])
                .select('*')
                .single();

              if (newUserError) {
                console.error('Error inserting new user:', newUserError);
                continue;
              } else {
                userIdForEvent = newUser.id;
              }
            } else {
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
                try {
                  const details = JSON.parse(event.details);
                  return details.block_id === blockId;
                } catch (e) {
                  console.error('Error parsing event details:', e);
                  return false;
                }
              });

              if (!matchingEvent) {
                console.log('No matching event found. Logging the current state.');
                // No previous event found, log this as a new event
                const { data, error } = await supabase
                  .from('events')
                  .insert([
                    {
                      org_id: orgId,
                      user_id: userIdForEvent,
                      input_type_id: 1, // Assuming 1 is the id for 'Notion'
                      timestamp: new Date().toISOString(),
                      details: JSON.stringify({
                        page_id: pageId,
                        block_id: blockId,
                        checkbox_value: checkboxValue
                      }),
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
      } catch (error) {
        console.error("Error processing page:", error);
        // Add more detailed error logging
        console.error("Error details:", error.message);
        if (error.stack) console.error("Stack trace:", error.stack);
        continue; // Skip processing this page if the call fails
      }
    }
  } catch (error) {
    console.error('Error tracking Notion pages:', error);
  }
}

// Execute the function immediately when triggered
trackNotionPages();