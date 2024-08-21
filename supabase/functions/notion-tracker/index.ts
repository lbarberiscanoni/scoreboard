import { serve } from 'https://deno.land/x/sift/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Client as NotionClient } from 'https://esm.sh/@notionhq/client';
import 'https://deno.land/x/dotenv/load.ts';

// Supabase setup using environment variables
const supabaseUrl = Deno.env.get('SUPA_URL');
const supabaseKey = Deno.env.get('SUPA_KEY');

console.log("Supabase URL:", supabaseUrl);
console.log("Supabase Key:", supabaseKey); // Check if this logs correctly

const supabase = createClient(supabaseUrl, supabaseKey);

// Notion setup using environment variables
const notionApiKey = Deno.env.get('NOTION_API_KEY');
const notion = new NotionClient({ auth: notionApiKey });
const pageId = Deno.env.get('NOTION_PAGE_ID');

console.log("Notion API Key:", notionApiKey);
console.log("Notion Page ID:", pageId);

async function checkCheckboxStatus() {
  try {
    const response = await notion.blocks.children.list({ block_id: pageId });
    const blocks = response.results;

    const checkboxBlock = blocks.find(block => block.type === 'to_do');
    console.log("Checkbox Block:", checkboxBlock);

    if (checkboxBlock) {
      const checkboxValue = checkboxBlock.to_do.checked;

      // Send data to Supabase
      const { data, error } = await supabase
        .from('checkbox_events')
        .insert([{ page_id: pageId, checkbox_value: checkboxValue, timestamp: new Date().toISOString() }]);

      if (error) console.error('Error logging checkbox event:', error);
      else console.log('Checkbox event logged:', checkboxValue);
    } else {
      console.log('No checkbox block found');
    }
  } catch (error) {
    console.error('Error fetching checkbox status:', error);
  }
}

// Poll every 10 seconds
setInterval(checkCheckboxStatus, 60000);

serve(() => new Response('Server is running and polling Notion', { status: 200 }));