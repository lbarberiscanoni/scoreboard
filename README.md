Dropping Zapier + Google-Sheets in favor of Supabase for tracking "the Scoreboard"

## Current Status 

We have two Edge Functions: one tracks when a checkbox is checked on a Notion Page, and the other uses Webhooks to listen for new commits on Github. Neither currently is able to dynamically track multiple input sources. 

We also have an initial schema that will help us track all of the Events for the different Organizations.

## Roadmap

- [ ] Line Chart
    - [ ] Cassandra Code Chart
    - [ ] Cassandra Documentation Chart


## Documentation

### Schema

1. **Organizations**
   - `id`: primary key (int4)
   - `name`: organization's name [Valyria, Cassandra] (varchar)
   - `created_at`: timestamp of when the organization was created
     - This is useful to track how many days since inception like Ramp does
   - `notion_api_key`: Notion's API key for tracking (varchar)
   - `github_api_key`: Github API key for the repos (varchar)

2. **Users**
   - `id`: primary key (int4)
   - `org_id`: foreign key reference to the Organization the User is a part of (int4)
   - `email`: email address for the User (varchar)
     - Might come in handy for notification purposes
   - `role`: User's role within the Organization [developer, lawyer, designer] (varchar)
     - Not useful yet but it may come in handy as we start having multiple types of contributors whose expectations are different
   - `name`: username (varchar)
   - `created_at`: timestamp of when the user joined the organization (timestamp)
     - Similarly useful to observe ramp-up time
   - `github_username`: GitHub username of the user (varchar)
   - `notion_username`: Notion username of the user (varchar)

3. **Input_types**
   - `id`: primary key (int4)
   - `name`: Type of activity being tracked ["notion", "code", "email", "documentation", "legal"] (varchar)

4. **Events**
   - `id`: primary key (int4)
   - `org_id`: foreign key reference to an Organization (int4)
   - `user_id`: foreign key reference to the User (int4)
   - `input_type_id`: foreign key reference to Input_types (int4)
   - `timestamp`: timestamp of when the input took place (timestamp)
   - `details`: JSON field to store event-specific details (jsonb)
     - For GitHub: commit message, repository ID
     - For Notion: page ID, block ID, checkbox status

5. **Repositories**
   - `id`: primary key (int4)
   - `org_id`: foreign key reference to an Organization (int4)
   - `repo_name`: name of the GitHub repository (varchar)
   - `webhook_secret`: the unique key for the repo's GitHub webhook (varchar)
   - `is_active`: [true, false] to represent active and inactive tracking status (bool)
   - `tracked_since`: timestamp of when the repo was first registered for tracking (timestamp)

6. **Notion_pages**
   - `id`: primary key (int4)
   - `org_id`: foreign key reference to an Organization (int4)
   - `page_id`: Notion page identifier (varchar)
   - `is_active`: [true, false] to represent active and inactive tracking status (bool)
   - `tracked_since`: timestamp of when the page was first registered for tracking (timestamp)

7. **Emails**
   - Will support this later