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

// Function to fetch historical commits from a GitHub repository
async function fetchHistoricalCommits(
  repoFullName: string, 
  githubToken: string,
  repoId: number,
  orgId: number, 
  inputTypeId: number
): Promise<number> {
  console.log(`Fetching historical commits for repository: ${repoFullName}`);
  
  // Calculate 60 days ago cutoff (to match the frontend display window)
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  try {
    // Fetch up to 3 pages of commits to avoid rate limiting issues
    let allCommits = [];
    let page = 1;
    let hasMoreCommits = true;
    
    while (hasMoreCommits && page <= 3) {
      const url = `https://api.github.com/repos/${repoFullName}/commits?page=${page}&per_page=100`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Scoreboard-App'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`GitHub API error: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const commits = await response.json();
      
      if (!commits || commits.length === 0) {
        hasMoreCommits = false;
      } else {
        allCommits = [...allCommits, ...commits];
        page++;
      }
    }
    
    console.log(`Fetched ${allCommits.length} commits from GitHub API`);

    // Filter commits by date (last 60 days)
    const recentCommits = allCommits.filter(commit => {
      const commitDate = new Date(commit.commit.author.date);
      return commitDate >= sixtyDaysAgo;
    });
    
    console.log(`Found ${recentCommits.length} commits within the last 60 days`);

    // Process each commit
    let importCount = 0;
    for (const commit of recentCommits) {
      const commitTime = new Date(commit.commit.author.date).toISOString();
      const commitMessage = commit.commit.message;
      const commitSha = commit.sha;
      const githubUsername = commit.author?.login;
      
      if (!githubUsername) {
        console.log(`Skipping commit ${commitSha} - no GitHub username found`);
        continue;
      }

      // Find users with matching GitHub username across all organizations
      const { data: allUsersData, error: usersError } = await supabase
        .from('users')
        .select('id, org_id')
        .eq('github_username', githubUsername);
      
      if (usersError || !allUsersData || allUsersData.length === 0) {
        console.log(`No matching user found for GitHub username: ${githubUsername}`);
        continue;
      }

      // Check if this commit is already in the database to avoid duplicates
      const { data: existingEvents, error: existingError } = await supabase
        .from('events')
        .select('id')
        .eq('org_id', orgId)
        .eq('input_type_id', inputTypeId)
        .filter('details->sha', 'eq', commitSha);

      if (!existingError && existingEvents && existingEvents.length > 0) {
        console.log(`Commit ${commitSha} already exists in database, skipping`);
        continue;
      }

      // Find the user that matches the repository organization
      const orgUser = allUsersData.find(user => user.org_id === orgId);
      
      // If no user matches the repository organization, find a user in any organization
      const userToUse = orgUser || allUsersData[0];
      
      // Log event using the selected user
      const { error } = await supabase
        .from('events')
        .insert([
          {
            org_id: orgId, // Always use the repository's organization
            user_id: userToUse.id,
            input_type_id: inputTypeId,
            timestamp: commitTime,
            details: JSON.stringify({
              repo_id: repoId,
              commit_message: commitMessage,
              sha: commitSha,
              cross_org: orgUser ? false : true // Flag if this is a cross-organization commit
            }),
          },
        ]);

      if (error) {
        console.error(`Error saving commit ${commitSha} to database:`, error);
      } else {
        importCount++;
        console.log(`Imported historical commit ${commitSha} for user ${userToUse.id}`);
      }
    }

    console.log(`Successfully imported ${importCount} historical commits for repository ${repoFullName}`);
    return importCount;
  } catch (error) {
    console.error('Error fetching historical commits:', error);
    throw error;
  }
}

// Check if this is the first event for a repository
async function isFirstEventForRepository(repoId: number, inputTypeId: number): Promise<boolean> {
  const { data, error, count } = await supabase
    .from('events')
    .select('id', { count: 'exact' })
    .filter('details->repo_id', 'eq', repoId.toString())
    .eq('input_type_id', inputTypeId)
    .limit(1);
  
  if (error) {
    console.error('Error checking for existing events:', error);
    return false;
  }
  
  return !count || count === 0;
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

    console.log(`Repository: ${repoName}, User: ${commitUserName}`);

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

    const { id: repoId, org_id: orgId, webhook_secret: webhookSecret } = repoData;

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

      // Check if this is the first event for this repository
      const isFirstEvent = await isFirstEventForRepository(repoId, inputTypeId);
      
      // If it's the first event, import historical commits
      if (isFirstEvent) {
        console.log(`First event detected for repository ${repoName}. Importing historical commits...`);
        
        // Fetch organization's GitHub API key
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .select('github_api_key')
          .eq('id', orgId)
          .single();

        if (orgError || !orgData || !orgData.github_api_key) {
          console.error('Error fetching organization data:', orgError || 'No GitHub API key found');
        } else {
          try {
            // Import historical commits
            const importCount = await fetchHistoricalCommits(
              repoName,
              orgData.github_api_key,
              repoId,
              orgId,
              inputTypeId
            );
            console.log(`Successfully imported ${importCount} historical commits`);
          } catch (importError) {
            console.error('Error importing historical commits:', importError);
            // Continue with processing the current webhook event even if historical import fails
          }
        }
      }

      // Process the current webhook event
      if (payload.commits) {
        const commits = payload.commits;

        // Find users with matching GitHub username across all organizations
        const { data: allUsersData, error: usersError } = await supabase
          .from('users')
          .select('id, org_id')
          .eq('github_username', commitUserName);
        
        if (usersError || !allUsersData || allUsersData.length === 0) {
          console.log(`No matching user found for GitHub username: ${commitUserName}`);
          return new Response('User not found', { status: 404 });
        }

        // Find the user that matches the repository organization
        const orgUser = allUsersData.find(user => user.org_id === orgId);
        
        // If no user matches the repository organization, use a user from any organization
        const userToUse = orgUser || allUsersData[0];
        
        console.log(`Using user ID ${userToUse.id} with org ${userToUse.org_id} to log commits for repo org ${orgId}`);

        for (const commit of commits) {
          const commitTime = new Date(commit.timestamp).toISOString();
          const commitMessage = commit.message;

          const { error } = await supabase
            .from('events')
            .insert([
              {
                org_id: orgId, // Always use the repository's organization
                user_id: userToUse.id,
                input_type_id: inputTypeId,
                timestamp: commitTime,
                details: JSON.stringify({
                  repo_id: repoId,
                  commit_message: commitMessage,
                  sha: commit.id,
                  cross_org: orgUser ? false : true // Flag if this is a cross-organization commit
                }),
              },
            ]);

          if (error) {
            console.error('Error saving commit data to Supabase:', error);
          } else {
            console.log(`Commit data saved to Supabase successfully for user ${userToUse.id}.`);
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