# Questions

Answer each question below. Replace the blank lines with your response.

## Part 1: Database Optimization

**1. In general, writes such as changing grades should only occur on the smaller normalized tables. Explain why. Since SQLite does not support materialized views, we write to both the normalized and denormalized tables instead. What problem(s) could this introduce?**

The normalized tables are the single source of truth: each fact (a grade, a student name, a course title) lives in exactly one row, so a write touches one place and cannot contradict itself. The denormalized tables are derived projections of that data, and the same fact may be copied across many rows. Writing there is much more expensive and easy to get wrong.

When writing to both tables, we have to consider some issues:
1. Consistency: if the two writes ever diverge, then reads will silently return stale data, and somebody has to actually notice a wrong grade on screen. We mitigate this with a transaction so both updates commit or neither does.
2. Write amplification: a single grade change now does at least two SQL statements. Adding columns to other denormalized tables would multiply this further. 
3. Maintenance burden: every new write path in the codebase has to know every denormalized table that mirrors the affected data, so the number of bugs increases with every feature.



**2. For each denormalized table you created, explain why you chose that specific set of columns. Why not include additional columns that might be useful later?**

Each table contains only what its one route needs to return, plus the columns it filters/sorts by.

- `student_courses(login_uid, course_id, course_code, course_title, instructor)` — `login_uid` is the WHERE key for `GET /api/students/:uid/courses`. The other four are what the dashboard renders for each card.
- `professor_courses(professor_uid, course_id, course_code, course_title, instructor)` — same shape, filtered by `professor_uid` for the professor dashboard. Built only from courses whose `professor_uid IS NOT NULL`.
- `course_content(course_id, week_id, week_title, week_sort, entry_id, entry_title, entry_type, entry_url, entry_sort)` — `course_id` is the lookup key, the rest is exactly the joined week/entry payload the course view consumes. The two `*_sort` columns are kept because the client sorts on them.
- `course_students(course_id, uid, name)` — the lookup key plus the two displayed fields
- `student_grades(login_uid, course_id, grade_id, assignment_id, assignment_name, score, sort_order)` — composite lookup key `(login_uid, course_id)`, the four fields the grades view shows, and `sort_order` so we can `ORDER BY` it.

I didn't add "maybe useful later" columns like passwords, course timestamps, or week descriptions. The whole point of denormalizing is trading storage for read speed, and that trade only pays off as long as the rows stay narrow: wider rows mean fewer rows per page, worse cache locality, and slower index scans. If a future view needs a different shape, the right answer is a new denormalized table tailored to that view instead of slowing things down for the user.



**3. Why not skip denormalization and just add indexes to the normalized tables?**

Indexes speed up finding rows, but they don't eliminate the join itself. Even with perfect indexes, a route like `GET /api/courses/:courseId/content` still has to walk `week`, look up every matching row in `entry`, and assemble the result. Routes like grades chain 3 tables (`grade` → `assignment` → filter by `course_id`), which increases the cost. Indexes make each individual seek fast, but they can't pre-combine the columns.

A denormalized table flattens that work once, at write time. The read becomes a single index seek plus a sequential range scan on a single table with the join already materialized — no join logic at query time, and the rows we want are physically grouped together so SQLite reads them off disk in a tight contiguous burst. When we have tens of thousands of students and courses, where each course view might be loaded thousands of times per minute, eliminating the join is what we need to scale.



**4. Which users should be able to read which data? Which users should be able to write which data? For each API endpoint, describe who should have access and what kind of access they should have.**

The general rule is least privilege: a request should be allowed only if the authenticated user has a legitimate reason to see or change the specific data identified in the URL. The `:uid` and `:courseId` in the path are user-supplied and cannot be trusted to identify the requester as the server has to compare them against the authenticated session.

- `POST /api/login` — open to anyone but it must actually verify the password
- `GET /api/students/:uid/courses` — read access only to the student whose `uid` matches the session, plus any professor who teaches one of the courses that student is enrolled in
- `GET /api/professors/:uid/courses` — read access to that professor
- `GET /api/courses/:courseId/content` — read access to students enrolled in that course and the professor teaching it
- `GET /api/courses/:courseId/students` — read access only to the professor teaching the course (and admins)
- `GET /api/students/:uid/courses/:courseId/grades` — read access to that student (and only for their own UID) and the professor teaching that course. No student may ever read another student's grades.
- `POST /api/grades` — write access only to the professor who teaches the course the affected grades belong to. Students must never be able to write grades, and a professor must not be able to write grades for a course they don't teach



## Part 2: Security

For each vulnerability, describe in your own words: (1) what the security hole is and what it allows an attacker to do, and (2) how you fixed it and why your fix works.

**HTTPS:**

*Hole.* The server used plain `app.listen` over HTTP, so the login body and auth cookie traveled in cleartext so anyone on the same network could read or modify them.

*Fix.* Replaced `app.listen` with `https.createServer({ key, cert }, app).listen(...)` using an `mkcert`-generated cert in `./certs`, and set `Strict-Transport-Security` so browsers refuse to fall back to HTTP. TLS encrypts and integrity-protects the whole connection.


**SQL Injection:**

*Hole.* The login query was string-interpolated: `WHERE uid = '${uid}' AND password = '${password}'`. A `uid` of `' OR '1'='1' --` short-circuits the WHERE to true and logs in as the first row. 

*Fix.* Rewrote the query as a prepared statement (`WHERE uid = ?`). better-sqlite3 sends the parameter separately from the SQL, so quotes and comments are treated as literal characters, never parsed. Also dropped the fallback so a wrong password is always a 401.


**Command Injection:**

*Hole.* `/api/search` ran `execSync(\`grep -rl "${query}" public/\`)`. A query like `x"; touch /tmp/pwned; echo "` closes the quoted argument and runs arbitrary shell commands as the Node process.

*Fix.* Switched to `execFileSync('grep', ['-rlF', '--', query, 'public/'])`. `execFile` skips the shell, so `query` is one literal argv element. `-F` neutralizes regex metacharacters, `--` blocks flag injection, and the endpoint now requires auth and caps `query` at 200 chars.


**Cross-Site Scripting (XSS):**

*Hole.* The client interpolated server data straight into `innerHTML` (course code, week title, assignment name, entry URL). A malicious value would execute in the victim's session, and `entry.url` going into `href` would let `javascript:` URLs run on click.

*Fix.* Two parts: 
1. Client: switched to `document.createElement` + `textContent` where possible, routed remaining `innerHTML` interpolations through an `escapeHtml()` helper, and guarded `href` with a `safeUrl()` helper that rejects non-`http(s)`/relative URLs. 
2. Server sends a strict CSP (`default-src 'self'; script-src 'self'; …`) so the browser blocks off-origin and inline scripts even if an escape is missed.


**Broken Authentication:**

*Hole.* No server-side session — `/api/login` just returned the user record and every subsequent request trusted whatever UID was in the URL. Passwords were stored in plaintext, and the login input was `type="text"` so it displayed on screen.

*Fix.*
- Passwords hashed with `bcrypt` at cost 12 and verified via `bcrypt.compareSync`
- Login signs a JWT (`HS256`, 2-hour TTL) and sets it as a cookie with `HttpOnly` (XSS can't read it), `Secure` (HTTPS only), and `SameSite=Strict` (not sent cross-site)
- A `requireAuth` middleware verifies the cookie on every protected route with `algorithms: ['HS256']` pinned
- On a missing user, a dummy bcrypt compare runs anyway so response time doesn't leak whether the UID exists
- Password input is now `type="password"`.


**Broken Access Control:**

*Hole.* Endpoints trusted the `:uid` and `:courseId` in the URL. Authenticated as Alice, you could still call `/api/students/987654321/.../grades` to read Bob's grades, or `POST /api/grades` to rewrite anyone's.

*Fix.* Every protected route now checks the authenticated user against the resource being accessed, server-side:
- `GET /api/students/:uid/courses` — `req.user.uid === :uid`
- `GET /api/professors/:uid/courses` — same self-check plus `role === 'professor'`
- `GET /api/courses/:courseId/content` — enrolled student or teaching professor
- `GET /api/courses/:courseId/students` — only the professor teaching that course
- `GET /api/students/:uid/courses/:courseId/grades` — the student themself, or the course's professor
- `POST /api/grades` — professor, plus a per-row check that they teach the course of each affected grade


**Cross-Site Request Forgery (CSRF):**

*Hole.* `Access-Control-Allow-Origin: *` with cookie auth meant any third-party page could `fetch(..., { credentials: 'include' })` and the browser would attach the victim's auth cookie silently overwriting grades or reading data.

*Fix.* Three parts:
1. **`SameSite=Strict` cookie** — browsers don't attach it to cross-site requests, so they arrive unauthenticated and 401
2. **Locked-down CORS** — the middleware only echoes `Access-Control-Allow-Origin` when `Origin` is our exact origin, and never sends `*`
3. **`requireSameOrigin` middleware**


**Dependency Vulnerabilities:**

*Hole.* `npm audit` flagged `jsonwebtoken@8.5.1` for three CVEs. `jwt.verify()` without an explicit `algorithms` option accepts `alg: none` tokens, letting an attacker forge a valid token with no signature.

*Fix.* Upgraded to `jsonwebtoken@^9.0.3` and pass `{ algorithms: ['HS256'] }` explicitly to `jwt.verify`. `npm audit` now reports zero vulnerabilities.





## Part 3: React

**5. Where does the expanded/collapsed state for each module live in your component hierarchy? Why did you put it there?**

Each `Module` owns its own `expanded` state via `useState(true)`. Nothing outside `Module` needs to know whether a given week is open as toggling Week 1 doesn't affect Week 2, and the parent `CourseContent` has no reason to care. Lifting it would mean more boilerplate, extra re-renders of unrelated siblings, and a parent carrying responsibility for something it doesn't use. If a future feature needed "expand all" or persistence across navigations, that would be the trigger to lift it.



**6. What did React make easier compared to the vanilla JavaScript implementation? What did it make harder?**

*Easier.*
- **Rendering reads like the data.** `.map()` replaces a loop that built HTML strings, parsed them via `innerHTML`, and wired event listeners by hand.
- **Local state is one line.** `const [expanded, setExpanded] = useState(true)` plus an `onClick` replaces "walk to `nextElementSibling` and toggle `.collapsed` on both."
- **Updates are automatic.** Toggling re-renders only the affected `Module` and diffs against the live DOM — no manual mutation tracking.

*Harder.*
- **Build step.** A `.jsx` edit doesn't show up until `npm run build:react` runs
- **Bundle size.** The unminified dev bundle of React + ReactDOM is 1.1 MB; the vanilla `loadModules` was a few hundred bytes
- **Bridging to vanilla code.** The sidebar still calls `document.getElementById('week-${id}')` to scroll, so the React component has to keep emitting that ID



## Part 4: Responsive Design

**7. For each media query breakpoint, explain why you chose that specific cutoff value and what layout or usability problem it solves. Describe the changes you made at each breakpoint in terms of the user experience (e.g. "the sidebar collapses into a hamburger menu because there isn't enough horizontal space to show it alongside the content"), not just the CSS properties you changed.**

Two cascading breakpoints over the desktop default: `max-width: 1024px` (tablet) and `max-width: 600px` (phone).

**Tablet — 1024px.** Catches the iPad envelope (768 portrait, 1024 landscape). The side-by-side layout still works, but the 240px sidebar was eating ~31% of an iPad-portrait viewport and leaving the reading area cramped. The sidebar narrows and the main padding tightens, giving the content a noticeably wider reading area without a structural change.

**Phone — 600px.** The side-by-side `sidebar | main` layout is structurally broken here — two ~200px columns are unreadable — so the course view stacks vertically: the sidebar becomes a short strip on top (back button + course code + Modules/Grades nav), and the duplicate week list (`#sidebar-modules`) is hidden because the main pane already shows every week. The Modules/Grades nav rotates from vertical pills with left-borders to horizontal pills with bottom-borders. The hacked-screen "PWNED!" box drops from a fixed `620px` to `min(38.75rem, 92vw)` and its title scales via `clamp` — otherwise it would horizontal-scroll. The login form's top margin shrinks so it stays in the first viewport. Course banner images switch to `aspect-ratio` so they shrink with the card instead of letterboxing. Net effect: every screen scrolls only vertically, nothing clips off the right edge, and the primary action on each screen is reachable without scrolling.

The cascade matters: at 412px both rules apply, so phone-specific overrides only restate what needs to differ from the tablet treatment.



**8. If you used AI for this part, what did you prompt it with, and what did you have to fix or adjust by hand?**

I used Claude Code to help me with this part. I first prompted to "help me understand how to start part 4" and I understood the requirements and created a plan in Plan mode. CSS and this kind of responsive design has always been lots of trial and error and can be very difficult to do manually, so using AI was very helpful here.

Got right on the first pass: spotting the pixel-bound culprits (`.hacked-box` 620px, `.course-sidebar` 240px, `.course-card-img` 140px), picking breakpoints aligned with the target devices, using `aspect-ratio` for the banner image, and using `minmax(min(260px, 100%), 1fr)` for the grid — `min(260px, 100%)` prevents horizontal overflow on viewports narrower than 260px.

I had to fix some things after this first prompt like wiring a `--topbar-height` CSS custom property through `shared.css` and referencing it from `course.css`, so the layout follows the topbar shrinking at the phone breakpoint instead of leaving a 4-pixel background band.

I learned the following:
1. Using `min(260px, 100%)` inside `minmax()` is a useful grid trick
2. CSS variables are the right tool when two unrelated selectors need to agree on a value
3. `clamp()` replaces chains of `@media` font-size rules cleanly when smooth scaling is acceptable
4. AI is incredibly useful and way more efficient when implementing responsive design in CSS

