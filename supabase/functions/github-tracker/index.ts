import { serve } from 'https://deno.land/x/sift/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import 'https://deno.land/x/dotenv/load.ts';

// Initialize Supabase client using environment variables
const supabaseUrl = Deno.env.get('SUPA_URL');
const supabaseKey = Deno.env.get('SUPA_KEY');
const supabase = createClient(supabaseUrl, supabaseKey);

// Function to create HMAC for signature verification
async function createHmac(algorithm: string, key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: { name: algorithm } },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  return `sha256=${Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;
}

// Verify the GitHub webhook signature
async function verifyGitHubSignature(body: string, secret: string, signature: string): Promise<boolean> {
  if (!signature) {
    console.error('Missing X-Hub-Signature-256 header');
    return false;
  }

  const computedSignature = await createHmac('SHA-256', secret, body);
  return signature === computedSignature;
}

// Serve function to handle requests
serve({
  '/github-tracker': async (req: Request) => {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const eventType = req.headers.get('X-GitHub-Event');
    const signature = req.headers.get('X-Hub-Signature-256');
    const body = await req.text(); // Read the request body once

    // Handle "ping" event from GitHub
    if (eventType === 'ping') {
      console.log('Received a ping event from GitHub.');
      return new Response('Ping event received', { status: 200 });
    }

    // Parse the GitHub webhook payload
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      console.error('Invalid JSON payload:', error);
      return new Response('Invalid JSON payload', { status: 400 });
    }

    const repoName = payload.repository?.full_name;
    const commitUserName = payload.sender?.login; // GitHub username of the committer

    console.log(repoName, commitUserName);

    // Fetch the users using the github_username
    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('id, org_id')
      .eq('github_username', commitUserName);
    
    if (usersError || !usersData || usersData.length === 0) {
      console.error('User not found or error fetching user data:', usersError || 'No user found');
      return new Response('User not found or error fetching user data', { status: 404 });
    }

    // Fetch repository details from Supabase
    const { data: repoData, error: repoError } = await supabase
      .from('repositories')
      .select('id, org_id, webhook_secret')
      .eq('repo_name', repoName)
      .eq('is_active', true)
      .maybeSingle();

    if (repoError || !repoData) {
      console.error('Repository not found or inactive:', repoError || 'No repository found');
      return new Response('Repository not found or inactive', { status: 404 });
    }

    const { id: repoId, webhook_secret: webhookSecret } = repoData;

    // Verify the GitHub webhook signature
    if (!(await verifyGitHubSignature(body, webhookSecret, signature))) {
      console.log("Signature mismatch");
      return new Response('Invalid signature', { status: 401 });
    }

    try {
      // Fetch input_type_id for "code"
      const { data: inputTypeData, error: inputTypeError } = await supabase
        .from('input_types')
        .select('id')
        .eq('name', 'code')
        .maybeSingle();

      if (inputTypeError || !inputTypeData) {
        console.error('Error fetching input type for code:', inputTypeError || 'No input type found');
        return new Response('Error fetching input type for code', { status: 500 });
      }

      const inputTypeId = inputTypeData.id;

      if (payload.commits) {
        const commits = payload.commits;

        for (const commit of commits) {
          const commitTime = new Date(commit.timestamp).toISOString();
          const commitMessage = commit.message;

          // Loop through each user associated with the GitHub username
          for (const user of usersData) {
            const { id: userId, org_id: orgId } = user;

            const { error } = await supabase
              .from('events')
              .insert([
                {
                  org_id: orgId,
                  user_id: userId,
                  input_type_id: inputTypeId, // Use dynamically fetched input_type_id for "code"
                  timestamp: commitTime,
                  details: JSON.stringify({
                    repo_id: repoId,
                    commit_message: commitMessage,
                  }),
                },
              ]);

            if (error) {
              console.error('Error saving commit data to Supabase:', error);
            } else {
              console.log(`Commit data saved to Supabase successfully for user ${userId}.`);
            }
          }
        }
      }

      return new Response('Webhook received', { status: 200 });
    } catch (error) {
      console.error('Error handling webhook:', error);
      return new Response('Error handling webhook', { status: 500 });
    }
  },

  '/': () => new Response('Hello, this is the root!', { status: 200 })
});