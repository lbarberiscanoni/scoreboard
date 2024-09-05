import { serve } from 'https://deno.land/x/sift/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import 'https://deno.land/x/dotenv/load.ts'; // Load environment variables

console.log('Function started');

// Supabase setup using environment variables
const supabaseUrl = Deno.env.get('SUPA_URL');
const supabaseKey = Deno.env.get('SUPA_KEY');
const webhookSecret = Deno.env.get('GITHUB_WEBHOOK_SECRET');

console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key:', supabaseKey);

const supabase = createClient(supabaseUrl, supabaseKey);

// Function to create HMAC using Web Crypto API
async function createHmac(algorithm: string, key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: { name: algorithm } },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  return `sha256=${Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;
}

// Verify GitHub signature function
async function verifyGitHubSignature(body: string, secret: string, signature: string): Promise<boolean> {
  if (!signature) {
    console.error('Missing X-Hub-Signature-256 header');
    return false;
  }

  const computedSignature = await createHmac('SHA-256', secret, body);

  if (signature !== computedSignature) {
    console.error(`Signature mismatch: received ${signature} but computed ${computedSignature}`);
    return false;
  }

  return true;
}

// Serve function to handle requests at the specific path
serve({
  '/github-tracker': async (req: Request) => {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const signature = req.headers.get('X-Hub-Signature-256');
    const body = await req.text(); // Read the request body only once

    if (!(await verifyGitHubSignature(body, webhookSecret, signature))) {
      return new Response('Invalid signature', {
        status: 401,
        headers: {
          'Access-Control-Allow-Origin': '*', // Adjust the origin as needed
          'Access-Control-Allow-Headers': 'Content-Type, X-Hub-Signature-256',
        },
      });
    }

    try {
      const payload = JSON.parse(body); // Parse the stored body instead of consuming req.json()
      console.log('Received payload:', payload);

      if (payload && payload.commits) {
        const repoName = payload.repository.full_name;
        const commits = payload.commits;
        console.log(`New commits in repository ${repoName}:`, commits);

        for (const commit of commits) {
          const commitTime = new Date(commit.timestamp).toISOString();
          const commitMessage = commit.message;

          const { error } = await supabase
            .from('github_commits')
            .insert([{ repo_name: repoName, commit_time: commitTime, commit_message: commitMessage }]);
          if (error) {
            console.error('Error saving commit data to Supabase:', error);
          } else {
            console.log('Commit data saved to Supabase successfully.');
          }
        }
      }

      return new Response('Webhook received', {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*', // Adjust the origin as needed
          'Access-Control-Allow-Headers': 'Content-Type, X-Hub-Signature-256',
        },
      });
    } catch (error) {
      console.error('Error handling webhook:', error);
      return new Response('Error handling webhook', {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*', // Adjust the origin as needed
          'Access-Control-Allow-Headers': 'Content-Type, X-Hub-Signature-256',
        },
      });
    }
  },

  '/': () => new Response('Hello, this is the root!', {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  }),
});