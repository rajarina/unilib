# UniLib — Student Library Portal

A single-page web application for managing a university library, built with plain HTML, CSS, and JavaScript backed by Firebase Firestore. Designed as a lab project for SonarCloud static analysis exercises.

> **3-file architecture** — `index.html` (HTML + CSS), `app.js` (all logic), `README.md`.  
> All 12 SonarCloud issues live in **`app.js`** so students only need to look at one file.

---

## Pages / Views

| View | Who can access | Description |
|------|---------------|-------------|
| Login | Everyone | Student / admin login |
| Books | Logged-in users | Browse and borrow books |
| My Loans | Students only | Active loans + history + Return button |
| Admin Panel | Admins only | Manage books, view all loans, fine calculator, report |

---

## 1. Firebase Setup (Instructor Guide)

### a. Create a Firebase project
1. Go to <https://console.firebase.google.com>
2. Click **Add project** → name it (e.g. `unilib-demo`) → finish the wizard

### b. Register a Web App
3. Click the **Web** icon (`</>`) on the project home page
4. Register as `unilib-web` (uncheck Firebase Hosting — not needed)
5. Copy the `firebaseConfig` object shown on screen

### c. Replace placeholder credentials
6. Open `app.js` and replace the `firebaseConfig` block near the top:

```js
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
```

### d. Enable Firestore
7. In Firebase Console → **Build → Firestore Database** → **Create database**
8. Choose **Start in test mode** → select a region → **Enable**

### e. Open the security rules
9. In Firestore → **Rules** tab, replace with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```
Click **Publish**.

> ⚠️ Open rules are for **lab/demo use only**. Never use in production.

> The app auto-seeds 8 books and 2 members on first load when the `books` collection is empty.

---

## 2. How to Run Locally

1. Complete Firebase Setup above
2. Open `index.html` in any modern browser (Chrome, Firefox, Edge)
3. No build step, no local server, no npm required

---

## 3. Deploy to GitHub Pages

1. Push the repository to GitHub
2. Go to **Settings → Pages**
3. Under **Branch** select `main` → `/root` → **Save**
4. Site goes live at:

```
https://yourusername.github.io/unilib
```

---

## 4. Demo Accounts

| Role    | Username   | Password     |
|---------|------------|--------------|
| Admin   | `admin`    | `Admin@1234` |
| Student | `student1` | `pass123`    |

**Student flow:** Login → Books (Borrow) → My Loans (Return)  
**Admin flow:** Login → Admin Panel (Books / Active Loans / Fine Calculator / Report)

---

## 5. Role-Based Access Rules

| View | Not logged in | Student | Admin |
|------|--------------|---------|-------|
| Login | ✅ Visible | — | — |
| Books | ↩ Redirected to login | ✅ Can borrow | ✅ Can view |
| My Loans | ↩ Redirected to login | ✅ Full access | ↩ Redirected to Books |
| Admin Panel | ↩ Redirected to login | ⛔ Alert + redirect | ✅ Full access |

---

## 6. Known Issues for Lab (SonarCloud Targets)

All issues are in **`app.js`**. Use the `// ─── SONARCLOUD ISSUE #N ───` comment blocks as reliable markers.

| # | Issue Type | SonarCloud Rule | Line (approx) | Description |
|---|-----------|----------------|---------------|-------------|
| 1 | Vulnerability | `javascript:S2068` | ~18 | Hard-coded Firebase API key and plain-text passwords (`ADMIN_PASSWORD`, `DEFAULT_PASSWORD`) in source code |
| 2 | Vulnerability | `javascript:S5808` | ~163 | Password exposed in redirect URL — `index.html?user=...&pass=...` visible in browser history |
| 3 | Bug | `javascript:S2259` | ~193 | Null dereference — `book.title.toUpperCase()` throws if `title` field is missing from Firestore |
| 4 | Bug | `javascript:S2184` | ~489 | Integer division — `Math.floor(daysOverdue / 2) * 0.50` truncates odd days (3 days → RM 1.00 not RM 1.50) |
| 5 | Bug | `javascript:S3760` | ~157 | Type-unsafe comparison — `member.role == 1` where role is the string `"admin"`, never the number `1` |
| 6 | Security Hotspot | `javascript:S1523` | ~249 | `eval()` builds a filter function from user-controlled genre string — code injection risk |
| 7 | Security Hotspot | `javascript:S5728` | ~200 | `innerHTML` built with unsanitised `book.title` and `book.author` from Firestore — XSS risk |
| 8 | Code Smell | `javascript:S1192` | multiple | String literal `"UNKNOWN"` repeated 5+ times (in `buildBookCard`, `renderActiveLoans`, `renderLoanHistory`, `loadAdminBooks`, `generateAdminReport`) without a named constant |
| 9 | Code Smell | `javascript:S3776` | ~499 | `generateAdminReport()` — cognitive complexity > 15; single 100+ line function with 6+ nested if/else blocks |
| 10 | Code Smell | `javascript:S1481` | ~9 | `MAX_BORROW_DAYS`, `lastSearchQuery`, `debugMode`, `APP_VERSION` declared at the top but never used |
| 11 | Code Smell | `javascript:S109` | multiple | Magic numbers `14`, `50`, `10`, `3` used directly in conditions inside `generateAdminReport()` without named constants |

> Line numbers are approximate. Use the `// ─── SONARCLOUD ISSUE #N ───` comment blocks as reliable markers.

---

## 7. Firestore Collections

| Collection | Fields |
|-----------|--------|
| `books`   | `title`, `author`, `genre`, `year`, `copies`, `available` |
| `members` | `username`, `password`, `role` |
| `loans`   | `bookId`, `bookTitle`, `memberName`, `borrowedAt`, `dueDate`, `returned`, `returnedAt`, `fineAmount` |
