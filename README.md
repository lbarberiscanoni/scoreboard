Dropping Zapier + Google-Sheets in favor of Supabase for tracking "the Scoreboard"

## Current Status 

We have two Edge Functions: one tracks when a checkbox is checked on a Notion Page, and the other uses Webhooks to listen for new commits on Github. Neither currently is able to dynamically track multiple input sources. 

We also have an initial schema that will help us track all of the Events for the different Organizations.

## Roadmap

- [ ] Implement the Schema 
    - [ ] Back-populate with the data from Google Sheets
- [ ] Dynamically track Notion Pages 
    - [ ] Only save data if there has been a change on the Notion 
- [ ] Dynamically track Github Repos
- [ ] Line Chart
    - [ ] Valyria Chart
    - [ ] Cassandra Code Chart
    - [ ] Cassandra Documentation Chart


## Documentation 

### Schema

1. Organizations
    - `id`: primary key 
    - `name`: organization's name [Valyria, Cassandra]
    - `createdAt`: timestamp of when the organization was created
        - This is useful to track how many days since inception like Ramp does 
2. Users
    - `id`: primary key 
    - `org_id`: foreign key reference to the Organization the User is a part of
    - `email`: email address for the User
        - might come in handy for notification purposes 
    - `role`: User's role within the Organization [developer]
        - not useful yet but it may come in handy as we start having multiple type of contributors whose expectations are different 
    - `name`: username 
    - `createdAt`: timestamp of when the user joined the organization 
        - similary useful to observe ramp-up time 
3. Events
    - `id`: primary key 
    - `org_id`: foreign key reference to an Organization 
    - `user_id`: foreign key reference to the User
    - `type_d`: oreign key reference to Repositories or NotionPages
    - `timestamp`: timestamp of when the input took place
    - `details`: JSON field to store event-specific details (e.g., commit message, notion page ID)
4. Repositories
    - `id`
    - `org_id`
    - `repo_name`
    - `webhook_secret`: the unique key for the repo's Github's webhook
    - `is_active`: [true, false] to represent active and inactive
    - `tracked_since`: timestamp of when the repo was first registered for tracking
5. NotionPages
    - `id`
    - `org_id`
    - `page_id`
    - `is_active`: [true, false] to represent active and inactive
    - `tracked_since`: timestamp of when the repo was first registered for tracking
6. Emails
    - will support this later