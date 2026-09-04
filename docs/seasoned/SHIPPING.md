# Shipping a feature with the agent

This is the short version of `AGENTS.md` for the person asking for features. You decide; the agent builds. Nothing goes out to the team until you say so.

## 1. Ask for it

Open a session and describe what you want in a sentence or two, for example "fix the redirect after login" or "add a column for waste to the production schedule". Say whether you want it in its own workspace (the normal case for a feature) or in the main copy (only for changes to the agent's own instructions and scripts).

## 2. The agent sets up a workspace

The agent creates a private copy of the app and its database just for this task, so nothing you try there can affect anyone else. Keep Docker Desktop running. If the agent asks you to start it, start it and wait.

When the workspace is ready the agent gives you two things: a web address, such as `http://localhost:3001`, and a login (`admin@local.test` / `bettrbyus-local`). That address is where you will look at the work.

## 3. Work in rounds

The agent does a chunk of the work, saves it, and sends you the address of the exact page where the change shows, with a note on what to look for there. Open it, try it, and reply with what is wrong, what is missing, or what comes next. Then the agent does the next round. Repeat until it looks right.

If a page will not load or something looks broken, just tell the agent. Do not try to fix it yourself.

The agent will not publish the work on its own, however finished it looks.

## 4. Say when you are done

Tell the agent you are done for now. It will ask whether the result is what you expected.

- If yes and you want the team to review it, say so. The agent publishes the work and gives you a link to the review page (the pull request). Approving and merging it into the real app is always your decision, even when every check on that page is green.
- If no, the work stays saved on your machine and nothing is published.

Then the agent asks whether you will come back to this task.

- Yes: it pauses the workspace and keeps everything, so the next session picks up where you left off.
- No: it cleans the workspace up. The saved work is kept, so an open review keeps its changes.

## 5. Cheat sheet

- Your only jobs: describe, look, judge, decide.
- Every workspace has its own address (`http://localhost:3001`, `3002`, and so on) and the same login.
- The agent never publishes or merges by itself. A green check is not permission.
- The full technical version lives in `docs/seasoned/AGENTS.md`.
