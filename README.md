# WildFit 🌿

A fitness tracker that rewards your workouts with collectible wild species,
with cloud sync so you and your partner never lose data and can share a guide.

---

## Part A — Put it on GitHub Pages (live website)

1. **Create the repo.** On GitHub: **＋ → New repository**, name it exactly
   `wildfit`, set **Public**, **Create repository** (no README).

2. **Enable Pages.** In the repo: **Settings → Pages → Source → GitHub Actions**.

3. **Set your username.** Open `vite.config.js` and make sure `base` is
   `'/wildfit/'` (it already is). If you named the repo something else, change it
   to `'/<repo-name>/'`.

4. **Push the code.** In a terminal inside this folder:
   ```bash
   git init
   git add .
   git commit -m "Initial WildFit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/wildfit.git
   git push -u origin main
   ```

5. Wait ~2 minutes. The **Actions** tab shows the deploy. When green, your app is
   live at **https://YOUR_USERNAME.github.io/wildfit/**

At this point the app fully works — but data is still local to each device until
you finish Part B.

---

## Part B — Turn on cloud sync (Firebase) — ~10 minutes, free

1. Go to **https://console.firebase.google.com** → **Add project**. Name it
   `wildfit` (or anything). You can disable Google Analytics. Create it.

2. **Create the database.** Left menu → **Build → Firestore Database** →
   **Create database** → start in **Production mode** → pick a location → Enable.

3. **Add the security rules.** In Firestore → **Rules** tab → delete what's there,
   paste the contents of `firestore.rules` from this folder → **Publish**.

4. **Turn on anonymous sign-in.** Left menu → **Build → Authentication** →
   **Get started** → **Sign-in method** → enable **Anonymous** → Save.

5. **Register a web app + get your config.** Project Overview (the ⚙️ →
   **Project settings**) → scroll to **Your apps** → click the **`</>`** (web)
   icon → give it a nickname → **Register app**. Copy the `firebaseConfig` object
   it shows you.

6. **Paste the config.** Open `src/firebase.js` and replace the placeholder
   `firebaseConfig` object (the one full of `REPLACE_ME`) with the one you copied.

7. **Push again:**
   ```bash
   git add .
   git commit -m "Add Firebase config"
   git push
   ```
   Wait for the Actions deploy to finish.

8. **Connect both phones.** Open the live app → **Settings (gear)** →
   **Cloud sync & backup** → enter the *same* household code on both phones
   (something long and private, e.g. `otter-river-4821`) → **Connect**. The page
   reloads and you're synced. 🎉

---

## How sync works

- Data is stored in Firestore under `households/<your-code>`. Both phones using
  the same code share the same data.
- A local copy is always kept on each device, so the app is instant and works
  offline; changes sync to the cloud when you're back online.
- Clearing your browser no longer loses anything — just reconnect with the same
  household code and your data pulls back down.
- The **Export** button in Settings still works as an extra manual backup.

## Notes on cost & safety

- Firebase's free **Spark** plan is far more than enough for personal use; no
  credit card required. You won't approach the daily limits.
- The values in `firebaseConfig` are safe to commit publicly — they identify your
  project but don't grant access on their own. Security comes from the rules
  (sign-in required) plus your private household code.
- Choose a long, non-obvious household code and don't share it publicly: anyone
  who has it can read/write your data.

## Updating the app later

Drop in a new `src/App.jsx`, then `git add . && git commit -m "update" && git push`.
GitHub rebuilds and redeploys automatically.

## Run locally (optional)

```bash
npm install
npm run dev
```
