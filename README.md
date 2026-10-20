# Teen Patti

Multiplayer Teen Patti for up to 7 seats, with computer players and 17 games the dealer can call.

- `docs/` is the website. GitHub Pages serves it.
- `functions/` is the Firebase function that shuffles, deals and runs every online table. Players' browsers only ever get their own cards.
- `firestore.rules` locks the database so nobody can read the deck or another player's hand.

Practice mode (you vs bots) works with zero setup. Online tables need the Firebase steps below, about 20 minutes once.

## Setup

### 1. Firebase project
1. Go to console.firebase.google.com and create a project.
2. Upgrade it to the **Blaze** plan. A card is required for Cloud Functions. At friends-game usage this stays inside the free tier, so expect $0. Set a $5 budget alert in Google Cloud Billing if you want a safety net.
3. **Build > Authentication > Get started > Sign-in method > Anonymous > Enable.**
4. **Build > Firestore Database > Create database.** Pick a US region and production mode.
5. **Project settings > Your apps > Web (`</>`).** Register an app and copy the `firebaseConfig` object.

### 2. Paste the config
Open `docs/firebase-config.js` and replace `null` with your config object. The example in that file shows the shape. These keys are safe to commit, the Firestore rules do the protecting.

### 3. Deploy the function and rules
You need Node 20 installed.
```
npm install -g firebase-tools
firebase login
cd teen-patti
firebase use --add            (pick your project)
cd functions && npm install && cd ..
firebase deploy --only functions,firestore:rules
```

### 4. Turn on GitHub Pages
1. Push this folder to a GitHub repo.
2. **Repo Settings > Pages > Source: Deploy from a branch > Branch: main, folder: /docs.**
3. Your table lives at `https://<your-username>.github.io/<repo-name>/`.
4. In Firebase **Authentication > Settings > Authorized domains**, add `<your-username>.github.io`.

### 5. Play
Host a table, hit **copy invite** next to the room code, and send the link. Friends open it, type a name, join.

## Editing the rules
All game logic is in `docs/engine.js`. If you change it, copy it to `functions/engine.js` too and redeploy the function, because the online tables run the copy in `functions/`.

To rebuild the single-file practice page: `node tools/build-practice.mjs practice.html`

## Rules as built

**Table setup (host, before start):** buy-in, boot (also the minimum bet and the raise gap), max blind rounds, Maha Laxmi starting chaal, show goes down on/off, deny private showdowns on/off, A-K-Q or A-2-3 as the top sequence. Changing rules in the lobby resets chips to the buy-in.

**Dealing:** one deck, one card at a time, clockwise. The host deals hand one. After that the winner deals and picks the game. The first card moves one seat clockwise every hand. The player after the first-dealt player acts first.

**Boot:** everyone posts the boot, or the dealer posts a table boot (boot x every player dealt in).

**Betting:** blind plays half the chaal. Raises go up in steps of the boot (blind raises in half steps). A blind raise doubles for seen players: blind raises $10 to $20, seen chaal is $40. Hitting the blind limit forces you to see.

**Show:** only with 2 left, costs one chaal. A seen player can't ask a blind player. A blind player can ask anyone.

**Sideshow / backshow:** only with 3+ left and nobody blind. Costs one chaal. Sideshow asks the next player, backshow asks the previous one. Both players see each other's cards and the loser packs. Deny (if on): backshow 2x chaal, sideshow 3x chaal and the denier's turn is used up.

**Ties:** show goes down on, the asker loses. Off: better original dealt cards win, then a final show splits the pot and a private showdown goes to a random card draw.

**Rebuy:** any amount up to 2x the buy-in, 3 times, any time except during Maha Laxmi. Short on chips mid-hand: rebuy or pack.

**No turn timer.** The host gets a button to pack an away player, or accept a showdown for them, so the table never freezes.

## Calls I made where the rules didn't say
- **Little Joker / Bigger Joker / Maha Laxmi:** if your lowest (or highest) card is a pair, both are jokers. Ace counts low or high, whichever gives you the better hand.
- **Maha Laxmi "smallest card":** picked from the cards that aren't already the J, Q or K jokers. So J-Q-K in J little makes the J and the Q jokers.
- **Maha Laxmi sub-round winner deals the next sub-round.** Packed players are dealt back in.
- **Maha Laxmi, everyone broke:** if fewer than 2 players can afford a blind chaal, one last hand is dealt face up and the best hand takes the whole pot. Without this the series can loop forever.
- **Card Color Burst:** if the Burst card has the same number as the Card, the Burst is redrawn. Blind players holding the burst number stay in until they see. If they reach a show still blind, they lose it. Burst players' cards are shown to the table.
- **Jua:** after all center cards are fixed, betting starts with the normal first player. Jua flips and fixes don't count as blind rounds.
- **Draw / Exchange:** the swapped-out card is discarded.
- **Face up:** the first 1 or 2 cards dealt to each player are the face-up ones.
- **Joining mid-game:** you take an open seat and get dealt in next hand.
- **Host leaves:** the next human player becomes host.
