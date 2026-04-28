// ═══════════════════════════════════════════════════════════════════════════
//  UniLib — Student Library Portal  |  app.js  |  All logic lives here
// ═══════════════════════════════════════════════════════════════════════════

// ─── SONARCLOUD ISSUE #10 ───────────────────────────────────────────────────
// Type: Code Smell | Rule: javascript:S1481
// Description: Variables declared at the top but never used anywhere in this file
// ───────────────────────────────────────────────────────────────────────────
const MAX_BORROW_DAYS = 14;
let   lastSearchQuery = "";
let   debugMode       = false;
const APP_VERSION     = "1.0.0";

// ─── SONARCLOUD ISSUE #1 ───────────────────────────────────────────────────
// Type: Vulnerability | Rule: javascript:S2068
// Description: Hard-coded API key and plain-text passwords stored in source code
// ───────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyD7ed0UaFboLguyKebBfmxI9BryI43jeB8",
  authDomain:        "unilibdemo.firebaseapp.com",
  projectId:         "unilibdemo",
  storageBucket:     "unilibdemo.firebasestorage.app",
  messagingSenderId: "982086299925",
  appId:             "1:982086299925:web:60c4b2538ee13fa1a3b91c"
};
const ADMIN_PASSWORD   = "Admin@1234";   // hard-coded credential
const DEFAULT_PASSWORD = "pass123";      // hard-coded credential

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ── Session state ────────────────────────────────────────────────────────────
let sessionUser = null;
let sessionRole = null;
let allBooks    = [];
let allLoans    = [];

// ── Seed data ─────────────────────────────────────────────────────────────────
const SEED_BOOKS = [
  { title: "Clean Code",                 author: "Robert C. Martin",  genre: "Programming", year: 2008, copies: 5, available: 5 },
  { title: "The Pragmatic Programmer",   author: "David Thomas",       genre: "Programming", year: 1999, copies: 3, available: 3 },
  { title: "JavaScript: The Good Parts", author: "Douglas Crockford",  genre: "Programming", year: 2008, copies: 4, available: 4 },
  { title: "A Brief History of Time",    author: "Stephen Hawking",    genre: "Science",     year: 1988, copies: 3, available: 3 },
  { title: "The Selfish Gene",           author: "Richard Dawkins",    genre: "Science",     year: 1976, copies: 2, available: 2 },
  { title: "Cosmos",                     author: "Carl Sagan",         genre: "Science",     year: 1980, copies: 4, available: 4 },
  { title: "Sapiens",                    author: "Yuval Noah Harari",  genre: "History",     year: 2011, copies: 5, available: 5 },
  { title: "Guns, Germs, and Steel",     author: "Jared Diamond",      genre: "History",     year: 1997, copies: 3, available: 3 }
];

async function seedDatabaseIfEmpty() {
  try {
    const snap = await db.collection("books").limit(1).get();
    if (!snap.empty) return;
    console.log("Seeding database…");
    const batch = db.batch();
    SEED_BOOKS.forEach(b => batch.set(db.collection("books").doc(), b));
    const mSnap = await db.collection("members").limit(1).get();
    if (mSnap.empty) {
      batch.set(db.collection("members").doc("admin"),
        { username: "admin",    password: ADMIN_PASSWORD,   role: "admin"   });
      batch.set(db.collection("members").doc("student1"),
        { username: "student1", password: DEFAULT_PASSWORD, role: "student" });
    }
    await batch.commit();
    console.log("Seeded.");
  } catch (e) { console.error("Seed error:", e); }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function showToast(msg, type = "success") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className   = "toast " + type + " show";
  setTimeout(() => { t.className = "toast"; }, 3500);
}
function closeModal() {
  document.getElementById("fineModal").style.display = "none";
}

// ── View management ───────────────────────────────────────────────────────────
function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.style.display = "none");
  document.getElementById(id).style.display = "block";
}
function showLoginView() {
  document.getElementById("navbar").style.display = "none";
  showView("view-login");
}
function showBooksView() {
  showView("view-books");
  loadBooks();
}
function showMyLoansView() {
  showView("view-myloans");
  loadMyLoans();
}
function showAdminView() {
  if (sessionRole !== "admin") return;   // console guard
  showView("view-admin");
  loadAdminBooks();
  loadAllLoans();
}

// ── Navbar (role-based) ───────────────────────────────────────────────────────
function buildNavbar() {
  const adminLink   = document.getElementById("nav-admin");
  const loansLink   = document.getElementById("nav-myloans");
  // Students see My Loans; Admins see Admin Panel — never both
  if (sessionRole === "admin") {
    adminLink.style.display = "inline";
    loansLink.style.display = "none";
  } else {
    adminLink.style.display = "none";
    loansLink.style.display = "inline";
  }
  document.getElementById("nav-username").textContent = sessionUser;
  document.getElementById("navbar").style.display     = "flex";
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function grantAdminAccess() { sessionStorage.setItem("isAdmin", "true"); }

function logout() {
  sessionUser = null; sessionRole = null;
  allBooks = []; allLoans = [];
  history.replaceState({}, "", "index.html");
  showLoginView();
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errEl    = document.getElementById("loginError");
  const btn      = document.getElementById("loginBtn");

  errEl.style.display = "none";
  btn.disabled = true; btn.textContent = "Logging in…";

  try {
    const doc = await db.collection("members").doc(username).get();
    if (!doc.exists || doc.data().password !== password) {
      errEl.textContent = "Invalid username or password.";
      errEl.style.display = "block";
      btn.disabled = false; btn.textContent = "Login";
      return;
    }
    const member = doc.data();
    sessionUser  = username;
    sessionRole  = member.role;

    // ─── SONARCLOUD ISSUE #5 ─────────────────────────────────────────────────
    // Type: Bug | Rule: javascript:S3760
    // Description: Type-unsafe comparison — role is the string "admin", never the
    //              number 1; this dead branch will never execute
    // ─────────────────────────────────────────────────────────────────────────
    if (member.role == 1) { grantAdminAccess(); }

    // ─── SONARCLOUD ISSUE #2 ─────────────────────────────────────────────────
    // Type: Vulnerability | Rule: javascript:S5808
    // Description: Password appended to URL — exposed in browser history and logs
    // ─────────────────────────────────────────────────────────────────────────
    window.location.href = "index.html?user=" + username + "&pass=" + password;

    // Single-page navigation continues correctly after the above line
    buildNavbar();
    if (sessionRole === "admin") showAdminView();
    else                         showBooksView();

  } catch (err) {
    console.error(err);
    errEl.textContent = "An error occurred. Please try again.";
    errEl.style.display = "block";
    btn.disabled = false; btn.textContent = "Login";
  }
}

// ── Books ─────────────────────────────────────────────────────────────────────
function availBadge(available) {
  if (available === 0) return { cls: "badge-red",   label: "Unavailable" };
  if (available <= 2)  return { cls: "badge-amber", label: "Limited"     };
  return                      { cls: "badge-green", label: "Available"   };
}

// ─── SONARCLOUD ISSUE #3 ─────────────────────────────────────────────────────
// Type: Bug | Rule: javascript:S2259
// Description: book.title may be undefined from Firestore; .toUpperCase() throws
// ─── SONARCLOUD ISSUE #7 ─────────────────────────────────────────────────────
// Type: Security Hotspot | Rule: javascript:S5728
// Description: innerHTML built with unsanitised Firestore data (book.title, book.author) — XSS risk
// ─────────────────────────────────────────────────────────────────────────────
function buildBookCard(book) {
  const upper    = book.title.toUpperCase();   // Issue #3: crashes if title is undefined
  const badge    = availBadge(book.available);
  const disabled = book.available <= 0 ? "disabled" : "";
  const btnLabel = book.available <= 0 ? "Unavailable" : "Borrow";
  const avail    = book.available + " of " + book.copies + " left";

  // Issue #7: innerHTML uses raw Firestore values without sanitisation
  return "<div class='book-card'>"
    + "<div class='avail-badge " + badge.cls + "'>" + badge.label + "</div>"
    + "<h3>" + book.title  + "</h3>"
    + "<p class='book-author'>"  + (book.author || "UNKNOWN") + "</p>"
    + "<div class='book-meta'>"
    +   "<span class='badge badge-genre'>" + (book.genre || "UNKNOWN") + "</span>"
    +   "<span class='badge badge-year'>"  + (book.year  || "UNKNOWN") + "</span>"
    + "</div>"
    + "<p class='avail-count'>" + avail + "</p>"
    + "<button class='borrow-btn' onclick='borrowBook(\""
    +   book.id + "\",\"" + book.title
    + "\")' " + disabled + ">" + btnLabel + "</button>"
    + "</div>";
}

function renderBookGrid(books) {
  const grid = document.getElementById("bookGrid");
  grid.innerHTML = books.length === 0
    ? "<p class='no-results'>No books found.</p>"
    : books.map(b => buildBookCard(b)).join("");
}

function loadBooks() {
  const loading = document.getElementById("booksLoading");
  const grid    = document.getElementById("bookGrid");
  loading.style.display = "flex"; grid.style.display = "none";

  db.collection("books").onSnapshot(snapshot => {
    allBooks = [];
    snapshot.forEach(doc => allBooks.push({ id: doc.id, ...doc.data() }));
    loading.style.display = "none"; grid.style.display = "grid";
    filterBooks();
  }, err => {
    console.error(err);
    loading.innerHTML = "<p style='color:red'>Failed to load books.</p>";
  });
}

function filterBooks() {
  const search = document.getElementById("searchInput").value.toLowerCase();
  const genre  = document.getElementById("genreFilter").value;
  let filtered = [...allBooks];

  if (genre && genre !== "all") {
    // ─── SONARCLOUD ISSUE #6 ───────────────────────────────────────────────
    // Type: Security Hotspot | Rule: javascript:S1523
    // Description: eval() called with user-controlled genre string — code injection risk
    // ─────────────────────────────────────────────────────────────────────────
    // dynamic filter for performance
    const filterFn = eval("(book) => book.genre === '" + genre + "'");
    filtered = filtered.filter(filterFn);
  }
  if (search) {
    filtered = filtered.filter(b =>
      (b.title || "").toLowerCase().includes(search) ||
      (b.genre || "").toLowerCase().includes(search)
    );
  }
  renderBookGrid(filtered);
}

async function borrowBook(bookId, bookTitle) {
  if (!sessionUser) { showToast("Please log in first.", "error"); return; }
  try {
    const existing = await db.collection("loans")
      .where("bookId",     "==", bookId)
      .where("memberName", "==", sessionUser)
      .where("returned",   "==", false).get();
    if (!existing.empty) { showToast("You already have this book borrowed.", "error"); return; }

    const bookRef = db.collection("books").doc(bookId);
    const bookDoc = await bookRef.get();
    if (!bookDoc.exists || bookDoc.data().available <= 0) {
      showToast("No longer available.", "error"); return;
    }

    const now = new Date();
    // ─── SONARCLOUD ISSUE #11 (partial) ───────────────────────────────────
    // Type: Code Smell | Rule: javascript:S109
    // Description: Magic number 14 used directly — no named constant
    // ─────────────────────────────────────────────────────────────────────────
    const dueDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const batch = db.batch();
    batch.update(bookRef, { available: bookDoc.data().available - 1 });
    batch.set(db.collection("loans").doc(), {
      bookId, bookTitle, memberName: sessionUser,
      borrowedAt: now.toISOString(), dueDate: dueDate.toISOString(),
      returned: false, returnedAt: null, fineAmount: 0
    });
    await batch.commit();
    showToast("Borrowed! Due back by " + dueDate.toLocaleDateString());
  } catch (err) {
    console.error(err); showToast("Failed to borrow. Try again.", "error");
  }
}

// ── My Loans ──────────────────────────────────────────────────────────────────
function daysBadge(dueDateStr) {
  const now      = new Date();
  const due      = new Date(dueDateStr);
  const daysLeft = Math.floor((due - now) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0)  return "<span class='days-badge overdue'>" + Math.abs(daysLeft) + " day(s) overdue</span>";
  if (daysLeft <= 3) return "<span class='days-badge due-soon'>" + daysLeft + " day(s) left</span>";
  return               "<span class='days-badge on-time'>"  + daysLeft + " day(s) left</span>";
}

// ─── SONARCLOUD ISSUE #8 ───────────────────────────────────────────────────
// Type: Code Smell | Rule: javascript:S1192
// Description: String literal "UNKNOWN" repeated 5+ times without a named constant
// ─────────────────────────────────────────────────────────────────────────────
function renderActiveLoans(loans) {
  const el = document.getElementById("activeLoansSection");
  document.getElementById("activeCount").textContent = loans.length;
  if (loans.length === 0) { el.innerHTML = "<p class='no-results'>No active loans.</p>"; return; }

  let html = "<div style='overflow-x:auto'><table><thead><tr>"
    + "<th>Book</th><th>Borrowed</th><th>Due Date</th><th>Status</th><th>Est. Fine</th><th>Action</th>"
    + "</tr></thead><tbody>";
  loans.forEach(loan => {
    const now      = new Date();
    const due      = new Date(loan.dueDate);
    const overDays = Math.max(0, Math.floor((now - due) / (1000 * 60 * 60 * 24)));
    const fineEst  = overDays > 0 ? "RM " + (overDays * 0.50).toFixed(2) : "—";
    const rowCls   = overDays > 0 ? "overdue-row" : "";
    html += "<tr class='" + rowCls + "'>"
      + "<td><strong>" + (loan.bookTitle  || "UNKNOWN") + "</strong></td>"   // Issue #8 ×1
      + "<td>" + new Date(loan.borrowedAt).toLocaleDateString() + "</td>"
      + "<td>" + due.toLocaleDateString() + "</td>"
      + "<td>" + daysBadge(loan.dueDate) + "</td>"
      + "<td>" + fineEst + "</td>"
      + "<td><button class='btn-return' onclick=\"returnBook('"
      +   loan.id + "','" + loan.bookId + "','" + loan.dueDate
      + "')\">Return</button></td></tr>";
  });
  el.innerHTML = html + "</tbody></table></div>";
}

function renderLoanHistory(loans) {
  const el = document.getElementById("loanHistorySection");
  document.getElementById("historyCount").textContent = loans.length;
  if (loans.length === 0) { el.innerHTML = "<p class='no-results'>No history yet.</p>"; return; }

  let html = "<div style='overflow-x:auto'><table><thead><tr>"
    + "<th>Book</th><th>Borrowed</th><th>Returned</th><th>Fine Paid</th><th>Status</th>"
    + "</tr></thead><tbody>";
  loans.forEach(loan => {
    const fine = loan.fineAmount > 0 ? "RM " + Number(loan.fineAmount).toFixed(2) : "None";
    html += "<tr>"
      + "<td><strong>" + (loan.bookTitle || "UNKNOWN") + "</strong></td>"    // Issue #8 ×2
      + "<td>" + new Date(loan.borrowedAt).toLocaleDateString() + "</td>"
      + "<td>" + (loan.returnedAt ? new Date(loan.returnedAt).toLocaleDateString() : "—") + "</td>"
      + "<td>" + fine + "</td>"
      + "<td><span class='badge badge-green'>Returned</span></td></tr>";
  });
  el.innerHTML = html + "</tbody></table></div>";
}

function loadMyLoans() {
  const spinner = "<div class='loading-wrapper'><div class='spinner'></div></div>";
  document.getElementById("activeLoansSection").innerHTML  = spinner;
  document.getElementById("loanHistorySection").innerHTML  = spinner;

  db.collection("loans").where("memberName", "==", sessionUser).get().then(snapshot => {
    const active = [], returned = [];
    snapshot.forEach(doc => {
      const l = { id: doc.id, ...doc.data() };
      if (l.returned) returned.push(l); else active.push(l);
    });
    active.sort((a, b)   => new Date(a.dueDate)     - new Date(b.dueDate));
    returned.sort((a, b) => new Date(b.returnedAt||0) - new Date(a.returnedAt||0));
    renderActiveLoans(active);
    renderLoanHistory(returned);
  }).catch(err => {
    console.error(err);
    document.getElementById("activeLoansSection").innerHTML = "<p style='color:red'>Failed to load.</p>";
  });
}

async function returnBook(loanId, bookId, dueDateStr) {
  const btn = document.querySelector("button[onclick*='" + loanId + "']");
  if (btn) { btn.disabled = true; btn.textContent = "Returning…"; }
  try {
    const now         = new Date();
    const due         = new Date(dueDateStr);
    const daysOverdue = Math.max(0, Math.floor((now - due) / (1000 * 60 * 60 * 24)));
    // Correct fine formula: RM 0.50 per day (NOT the buggy admin calculator formula)
    const fineAmount  = daysOverdue * 0.50;

    const batch = db.batch();
    batch.update(db.collection("loans").doc(loanId),
      { returned: true, returnedAt: now.toISOString(), fineAmount });
    batch.update(db.collection("books").doc(bookId),
      { available: firebase.firestore.FieldValue.increment(1) });
    await batch.commit();

    if (fineAmount > 0) {
      document.getElementById("modalFineAmount").textContent = "RM " + fineAmount.toFixed(2);
      document.getElementById("fineModal").style.display = "flex";
    } else {
      showToast("Book returned successfully!");
    }
    loadMyLoans();
  } catch (err) {
    console.error(err); showToast("Failed to return. Try again.", "error");
    if (btn) { btn.disabled = false; btn.textContent = "Return"; }
  }
}

// ── Admin — Books ─────────────────────────────────────────────────────────────
function loadAdminBooks() {
  const tbody = document.getElementById("adminBooksTbody");
  tbody.innerHTML = "<tr><td colspan='6'><div class='loading-wrapper'><div class='spinner'></div></div></td></tr>";
  db.collection("books").get().then(snapshot => {
    tbody.innerHTML = "";
    if (snapshot.empty) {
      tbody.innerHTML = "<tr><td colspan='6' style='text-align:center;color:#999'>No books.</td></tr>"; return;
    }
    snapshot.forEach(doc => {
      const b = doc.data();
      const row = document.createElement("tr");
      row.innerHTML =
        "<td>" + (b.title  || "UNKNOWN") + "</td>"   // Issue #8 ×3
      + "<td>" + (b.author || "UNKNOWN") + "</td>"   // Issue #8 ×4
      + "<td>" + (b.genre  || "UNKNOWN") + "</td>"   // Issue #8 ×5
      + "<td>" + (b.year   || "") + "</td>"
      + "<td>" + b.available + " / " + b.copies + "</td>"
      + "<td><button class='btn-danger-sm' onclick=\"deleteBook('" + doc.id + "')\">Delete</button></td>";
      tbody.appendChild(row);
    });
  });
}

async function addBook(e) {
  e.preventDefault();
  const title  = document.getElementById("newTitle").value.trim();
  const author = document.getElementById("newAuthor").value.trim();
  const genre  = document.getElementById("newGenre").value;
  const year   = parseInt(document.getElementById("newYear").value);
  const copies = parseInt(document.getElementById("newCopies").value);
  if (!title || !author || !year || !copies) { showToast("Fill in all fields.", "error"); return; }
  try {
    await db.collection("books").add({ title, author, genre, year, copies, available: copies });
    showToast("Book added!"); document.getElementById("addBookForm").reset(); loadAdminBooks();
  } catch (err) { showToast("Failed to add.", "error"); }
}

async function deleteBook(bookId) {
  if (!confirm("Delete this book?")) return;
  try {
    await db.collection("books").doc(bookId).delete();
    showToast("Book deleted."); loadAdminBooks();
  } catch (err) { showToast("Failed to delete.", "error"); }
}

// ── Admin — All Active Loans ──────────────────────────────────────────────────
function loadAllLoans() {
  const tbody = document.getElementById("adminLoansTbody");
  tbody.innerHTML = "<tr><td colspan='5'><div class='loading-wrapper'><div class='spinner'></div></div></td></tr>";
  db.collection("loans").where("returned", "==", false).get().then(snapshot => {
    allLoans = []; tbody.innerHTML = "";
    if (snapshot.empty) {
      tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;color:#999'>No active loans.</td></tr>"; return;
    }
    const now = new Date();
    snapshot.forEach(doc => {
      const loan = doc.data();
      allLoans.push({ id: doc.id, ...loan });
      const due = new Date(loan.dueDate); const isOver = now > due;
      const row = document.createElement("tr");
      if (isOver) row.classList.add("overdue-row");
      row.innerHTML =
          "<td>" + (loan.memberName || "UNKNOWN") + "</td>"
        + "<td>" + (loan.bookTitle  || "UNKNOWN") + "</td>"
        + "<td>" + new Date(loan.borrowedAt).toLocaleDateString() + "</td>"
        + "<td>" + due.toLocaleDateString() + "</td>"
        + "<td><span class='badge " + (isOver ? "badge-red" : "badge-green") + "'>"
        +   (isOver ? "Overdue" : "On Time") + "</span></td>";
      tbody.appendChild(row);
    });
  });
}

// ── Admin — Fine Calculator (intentionally buggy formula) ─────────────────────
// ─── SONARCLOUD ISSUE #4 ─────────────────────────────────────────────────────
// Type: Bug | Rule: javascript:S2184
// Description: Integer division truncates odd days — 3 days → RM 1.00 not RM 1.50
// ─────────────────────────────────────────────────────────────────────────────
function calculateFine(daysOverdue) {
  const fine = Math.floor(daysOverdue / 2) * 0.50;
  document.getElementById("fineResult").textContent   = "RM " + fine.toFixed(2);
  document.getElementById("fineResult").style.display = "block";
}

// ── Admin — Report (high cognitive complexity) ────────────────────────────────
// ─── SONARCLOUD ISSUE #9 ─────────────────────────────────────────────────────
// Type: Code Smell | Rule: javascript:S3776
// Description: Single 100+ line function with 6+ nested if/else blocks, no helpers
// ─────────────────────────────────────────────────────────────────────────────
function generateAdminReport() {
  const output = document.getElementById("reportOutput");
  let report   = "===== UNILIB ADMIN REPORT =====\n";
  report += "Generated: " + new Date().toLocaleString() + "\n\n";

  const now         = new Date();
  const memberFines = {};
  const memberLoans = {};
  const genreCount  = {};

  // ── Section 1: Overdue loans ──────────────────────────────────────────────
  report += "--- OVERDUE LOANS ---\n";
  if (allLoans.length > 0) {
    allLoans.forEach(loan => {
      const member      = loan.memberName || "UNKNOWN";
      const due         = new Date(loan.dueDate);
      const daysOverdue = Math.floor((now - due) / (1000 * 60 * 60 * 24));
      memberLoans[member] = (memberLoans[member] || 0) + 1;
      if (daysOverdue > 0) {
        const fine = daysOverdue * 0.50;
        memberFines[member] = (memberFines[member] || 0) + fine;
        // ─── SONARCLOUD ISSUE #11 (1 of 5) ──────────────────────────────
        // Type: Code Smell | Rule: javascript:S109 — magic number 14
        if (daysOverdue > 14) {
          report += "  [CRITICAL] " + (loan.bookTitle || "UNKNOWN") + " — " + member + " (" + daysOverdue + "d, RM" + fine.toFixed(2) + ")\n";
        } else {
          report += "  [OVERDUE]  " + (loan.bookTitle || "UNKNOWN") + " — " + member + " (" + daysOverdue + "d, RM" + fine.toFixed(2) + ")\n";
        }
      } else {
        report += "  [ON TIME]  " + (loan.bookTitle || "UNKNOWN") + " — " + member + "\n";
      }
    });
  } else {
    report += "  No loan data loaded. Open Loans tab first.\n";
  }

  // ── Section 2: Member tiers ───────────────────────────────────────────────
  report += "\n--- MEMBER TIERS ---\n";
  const members = Object.keys(memberLoans);
  // ─── SONARCLOUD ISSUE #11 (2 of 5) ── magic number 50
  if (members.length > 50) {
    report += "  WARNING: Large cohort — " + members.length + " active borrowers.\n";
  } else {
    if (members.length === 0) {
      report += "  No borrowing activity recorded.\n";
    } else {
      members.forEach(m => {
        const count = memberLoans[m];
        const fine  = memberFines[m] || 0;
        if (count === 0) {
          report += "  [TIER 0 — INACTIVE]   " + m + "\n";
        } else if (count <= 3) {
          if (fine > 0) {
            // ─── SONARCLOUD ISSUE #11 (3 of 5) ── magic number 10
            if (fine > 10) {
              report += "  [TIER 1 — HIGH FINE]  " + m + " (" + count + " loans, RM" + fine.toFixed(2) + ")\n";
            } else {
              report += "  [TIER 1 — CASUAL]     " + m + " (" + count + " loans, RM" + fine.toFixed(2) + ")\n";
            }
          } else {
            report += "  [TIER 1 — CASUAL]     " + m + " (" + count + " loans)\n";
          }
        } else {
          if (fine > 0) {
            if (fine > 10) {
              report += "  [TIER 2 — HEAVY/FINE] " + m + " (" + count + " loans, RM" + fine.toFixed(2) + ")\n";
            } else {
              report += "  [TIER 2 — HEAVY]      " + m + " (" + count + " loans, RM" + fine.toFixed(2) + ")\n";
            }
          } else {
            report += "  [TIER 2 — HEAVY]      " + m + " (" + count + " loans)\n";
          }
        }
      });
    }
  }

  // ── Section 3: Genre & stock ──────────────────────────────────────────────
  report += "\n--- GENRE & STOCK ---\n";
  if (allBooks.length > 0) {
    allBooks.forEach(book => {
      const g = book.genre || "Other";
      genreCount[g] = (genreCount[g] || 0) + 1;
      // ─── SONARCLOUD ISSUE #11 (4 of 5) ── magic number 3
      if (book.available > 3) {
        report += "  [WELL STOCKED] " + (book.title || "UNKNOWN") + " (" + book.available + " avail)\n";
      } else if (book.available > 0) {
        report += "  [LOW STOCK]    " + (book.title || "UNKNOWN") + " (" + book.available + " left)\n";
      } else {
        report += "  [ALL OUT]      " + (book.title || "UNKNOWN") + "\n";
      }
    });
    report += "\n  Genre counts:\n";
    Object.keys(genreCount).forEach(g => { report += "    " + g + ": " + genreCount[g] + "\n"; });
    const top = Object.keys(genreCount).reduce((a, b) => genreCount[a] > genreCount[b] ? a : b, "");
    if (top) report += "  Most stocked genre: " + top + "\n";
  } else {
    report += "  No book data. Open Books tab first.\n";
  }

  // ── Section 4: Fine summary ───────────────────────────────────────────────
  report += "\n--- FINE SUMMARY ---\n";
  const totalFines = Object.values(memberFines).reduce((a, b) => a + b, 0);
  if (Object.keys(memberFines).length > 0) {
    Object.entries(memberFines).forEach(([m, f]) => {
      // ─── SONARCLOUD ISSUE #11 (5 of 5) ── magic number 10
      if (f > 10) {
        report += "  [HIGH ⚠️] " + m + ": RM" + f.toFixed(2) + "\n";
      } else {
        report += "  " + m + ": RM" + f.toFixed(2) + "\n";
      }
    });
    report += "\n  Total outstanding: RM" + totalFines.toFixed(2) + "\n";
  } else {
    report += "  No outstanding fines.\n";
  }

  // ── Section 5: Library health ─────────────────────────────────────────────
  report += "\n--- LIBRARY HEALTH ---\n";
  const totalBooks     = allBooks.length;
  const overdueCount   = allLoans.filter(l => new Date(l.dueDate) < now).length;
  const availableCount = allBooks.filter(b => b.available > 0).length;
  if (totalBooks === 0) {
    report += "  No data available.\n";
  } else {
    const pct = Math.round((availableCount / totalBooks) * 100);
    if (pct >= 75)      report += "  Status: HEALTHY ("   + pct + "% of titles available)\n";
    else if (pct >= 40) report += "  Status: MODERATE ("  + pct + "% of titles available)\n";
    else                report += "  Status: CRITICAL ("  + pct + "% of titles available)\n";
    report += "  Overdue loans: " + overdueCount + "\n";
    report += "  Outstanding fines: RM" + totalFines.toFixed(2) + "\n";
  }

  report += "\n=================================\n";
  output.textContent   = report;
  output.style.display = "block";
}

// ── Admin Tabs ────────────────────────────────────────────────────────────────
function openAdminTab(tabName) {
  document.querySelectorAll(".tab-panel").forEach(p => p.style.display = "none");
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("tab-" + tabName).style.display = "block";
  document.querySelector("[data-tab='" + tabName + "']").classList.add("active");
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  await seedDatabaseIfEmpty();

  // Auto-login from URL params (side-effect of Issue #2 redirect)
  const params  = new URLSearchParams(window.location.search);
  const urlUser = params.get("user");
  const urlPass = params.get("pass");
  if (urlUser && urlPass) {
    try {
      const doc = await db.collection("members").doc(urlUser).get();
      if (doc.exists && doc.data().password === urlPass) {
        sessionUser = urlUser; sessionRole = doc.data().role;
        history.replaceState({}, "", "index.html");
        buildNavbar();
        if (sessionRole === "admin") showAdminView(); else showBooksView();
        return;
      }
    } catch (e) { /* fall through */ }
  }

  showLoginView();
  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("searchInput").addEventListener("input",  filterBooks);
  document.getElementById("genreFilter").addEventListener("change", filterBooks);
  document.getElementById("addBookForm").addEventListener("submit", addBook);
  document.getElementById("calcBtn").addEventListener("click", () => {
    const days = parseInt(document.getElementById("daysInput").value);
    if (!isNaN(days) && days >= 0) calculateFine(days);
    else showToast("Enter a valid number.", "error");
  });
  document.getElementById("reportBtn").addEventListener("click", generateAdminReport);
  document.querySelectorAll(".tab-btn").forEach(btn =>
    btn.addEventListener("click", () => openAdminTab(btn.dataset.tab))
  );
});
