# Game servers (Firebase project game-night-83c72)

All five game servers in one place: tp (Teen Patti), jg (Judgment), dc (Declare), dl (Business Deal cards), bd (Business Board).
Each is its own codebase, so deploying one never touches the others.

Redeploy everything from Google Cloud Shell:

    bash servers/deploy.sh game-night-83c72

Redeploy one game only:

    cd servers && firebase deploy --only functions:judgment --project game-night-83c72 --non-interactive

Do NOT pass --force and do NOT set a functions cleanup policy. A cleanup policy deleted the
server images on the old teenpatti-44fde project and took every game offline.

If the server is ever down, the games keep working: tables fall back to running on the host's browser (p2p/hybrid.js in each game).
