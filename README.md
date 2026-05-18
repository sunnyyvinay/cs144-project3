# Project 3: CubHub

CubHub is a simplified course management system built with Express and SQLite. The database is recreated each time the server starts — `server.js` deletes the database file and runs `init_db.js` to rebuild the schema and seed data from scratch.

## Getting Started

```
npm install
node server.js
```

Then open http://localhost:3000 in your browser.

Each part has associated questions in [`QUESTIONS.md`](QUESTIONS.md). Answer all questions in that file.

### Test Accounts

| UID | Password | Role |
|-----|----------|------|
| 123456789 | alice123 | student |
| 987654321 | bob456 | student |
| 555123456 | charlie789 | student |
| profrosario | bruin | professor |

To bypass the PWNED screen, press **Tab** or navigate directly to `http://localhost:3000#home`.

---

## Part 1: Database Optimization

The current database uses normalized tables. The server assembles data for each view by JOINing multiple tables at query time.

Your task is to create **denormalized tables** — one for each view listed below — that pre-combine the data each view needs. Each denormalized table should contain only the columns that its view requires. Do not simply join all tables together into one giant table. Once you have created these tables, update the server routes so that each API endpoint runs a simple `SELECT ... WHERE` query against a single denormalized table instead of JOINing across multiple tables.

### What to Do

1. In `init_db.js`, add `CREATE TABLE ... AS SELECT` statements **after** the seed data section. These statements should create your denormalized tables by selecting and joining data from the normalized tables. Do not write separate `INSERT` statements — the `CREATE TABLE ... AS SELECT` pattern handles both table creation and population in one step.

2. Do not modify or delete the existing normalized tables or seed data. The script should continue to insert data into the normalized tables first, then your denormalized tables are derived from them. The denormalized tables are rebuilt automatically each time the server starts.

3. In `server.js`, rewrite each route handler to query your denormalized tables. Each route handler should run a simple `SELECT ... WHERE` against a single denormalized table — no JOINs at query time. (Your `CREATE TABLE ... AS SELECT` statements in `init_db.js` will of course use JOINs to build the denormalized tables.) Each route below must query its corresponding denormalized table:

   | Route | Denormalized Table |
   |-------|--------------------|
   | `GET /api/students/:uid/courses` | `student_courses` |
   | `GET /api/professors/:uid/courses` | `professor_courses` |
   | `GET /api/courses/:courseId/content` | `course_content` |
   | `GET /api/courses/:courseId/students` | `course_students` |
   | `GET /api/students/:uid/courses/:courseId/grades` | `student_grades` |

4. Your schema must scale. In production this database would contain tens of thousands of students and courses. Queries must remain fast regardless of how large the tables grow.

5. The application must continue to work exactly as before — all views should display the same data.

### Views

**Student Dashboard** — `GET /api/students/:uid/courses`

Given a student's UID, returns the courses they are enrolled in (course ID, code, title, and instructor). Your denormalized table should map each student directly to their enrolled course information.

**Professor Dashboard** — `GET /api/professors/:uid/courses`

Given a professor's UID, returns the courses they teach (course ID, code, title, and instructor).

**Course Content** — `GET /api/courses/:courseId/content`

Given a course ID, returns all weekly modules and their entries. Each row contains the week ID, week title, week sort order, entry ID, entry title, entry type, entry URL, and entry sort order.

**Course Roster** — `GET /api/courses/:courseId/students`

Given a course ID, returns the students enrolled in that course (UID and name).

**Grades** — `GET /api/students/:uid/courses/:courseId/grades`

Given a student's UID and a course ID, returns their assignment grades. Each row contains the grade ID, assignment ID, assignment name, and score.

### Writes

All write operations (e.g. `POST /api/grades`) should write to both the normalized tables and the corresponding denormalized tables. The denormalized tables are rebuilt from the normalized data each time the server starts, but mid-session writes must update both so that subsequent reads reflect the changes.

Answer questions 1–4 in [`QUESTIONS.md`](QUESTIONS.md).

---

## Part 2: Security

This application has multiple security vulnerabilities. Your task is to find and fix each one. The following categories of vulnerability are present, listed in a suggested order — some fixes depend on earlier ones being in place, so working top to bottom will save you debugging time.

1. **No HTTPS** — The server runs over unencrypted HTTP. Set up HTTPS using a locally-trusted certificate. Use [mkcert](https://github.com/FiloSottile/mkcert) to generate a certificate that your browser will trust without warnings (`mkcert -install` then `mkcert localhost`).

2. **SQL Injection** — User input is interpolated directly into a SQL query, allowing an attacker to alter the query's logic.

3. **Command Injection** — User input is passed directly to a shell command without sanitization.

4. **Cross-Site Scripting (XSS)** — Data from the server is rendered into the page without proper escaping, allowing script injection. Implement Content Security Policy (CSP) headers as an additional layer of defense.

5. **Broken Authentication** — There is no server-side session management. The server has no way to know who is making a request. Passwords are stored in plaintext and the password field is not masked. Implement authentication using JSON Web Tokens (JWTs) stored in cookies with the appropriate security attributes (HttpOnly, Secure, SameSite).

6. **Broken Access Control** — API endpoints do not verify the identity or role of the requester. Users can access other users' data by manipulating URLs, and any user can perform professor-only actions such as changing grades. Pay attention to what data is exposed to the client — even on read-only pages.

7. **Cross-Site Request Forgery (CSRF)** — The application does not validate the origin of state-changing requests and has overly permissive CORS headers.

8. **Dependency Vulnerabilities** — Run `npm audit` and address any reported issues.

### Think Like an Attacker

To find vulnerabilities, ask yourself these questions about every part of the application. These include but are not limited to:

- For every input in the application, what happens if a user enters something the developer didn't expect?
- For every API endpoint, what happens if you call it without being logged in, or as a different user?
- For every piece of data displayed in the browser, where did it come from and could it be malicious?
- Could someone on the same network as the user intercept or read what is being sent?
- If a user is logged into CubHub and visits a malicious site in another tab, could that site make requests to CubHub on their behalf?
- If an attacker gained access to the database, what sensitive data would be exposed in plaintext?
- Do you trust all the code running in your application, including code you didn't write?

For each vulnerability you find, describe the security hole and how you fixed it in [`QUESTIONS.md`](QUESTIONS.md).

---

## Part 3: React

Rewrite the course content area as React components. Specifically, replace the module rendering done by `loadModules()` in `course.js` — the weekly module list with expandable/collapsible sections and the slide/recording entry links. Your React component tree should be mounted into the existing `#modules-container` element. The sidebar navigation, grades view, and the rest of the application remain vanilla JavaScript.

JSX is not valid JavaScript — it must be compiled before the browser can run it. Use [esbuild](https://esbuild.github.io/) to compile your JSX and bundle it into a single file that you serve from the Express server:

```
npx esbuild src/CourseContent.jsx --bundle --outfile=public/course-react.js
```

Add `--watch` to automatically rebuild as you edit. In production, a more full-featured tool like [Vite](https://vite.dev/) is typically preferred for its dev server, hot module replacement, and optimized builds, but for this project esbuild keeps the tooling minimal so you can focus on React itself. Do not use in-browser Babel transforms (e.g. `<script type="text/babel">`) — these require `unsafe-eval` and would violate the Content Security Policy you implemented in Part 2.

Choose the right level of abstraction for your components. Not everything should be one giant component, but not every HTML element needs to be its own component either. Your component hierarchy should reflect the natural structure of the UI — each component should have a clear responsibility and manage an appropriate amount of complexity.

Answer questions 5–6 in [`QUESTIONS.md`](QUESTIONS.md).

---

## Part 4: Responsive Design

The application currently uses fixed pixel values for layout and sizing. Your task is to make it responsive so that it looks and functions well on the following devices:

- **iPad** (standard, 768×1024) — use the built-in device profile in Chrome DevTools
- **Google Pixel 10** — create a custom device profile in Chrome DevTools with the appropriate screen dimensions

You are encouraged to use AI tools (e.g. Claude, ChatGPT) to help with this part. Responsive CSS involves a lot of trial and error, and AI can accelerate the iteration cycle. If you use AI, include a brief note about how you used it and what you learned.

### Requirements

1. Replace fixed pixel dimensions that prevent the layout from adapting to different screen sizes (e.g. fixed-width containers, fixed-height images) with relative units (`em`, `rem`, `vw`, `%`). Use `min()`, `max()`, or `clamp()` to set sensible minimum and maximum sizes. Pixel values are fine where they do not affect responsiveness, such as borders, small icon sizes, or box shadows.

2. Images (such as the course banner images on the dashboard) must use relative widths (e.g. `%` or `vw`) instead of fixed pixel dimensions, and scale properly across screen sizes.

3. Add **two media query breakpoints** — one for tablet-sized screens and one for phone-sized screens. Each breakpoint should make meaningful layout changes (e.g. adjusting the grid, collapsing the sidebar, resizing typography).

4. All views should remain usable at both target screen sizes. Text should be readable, buttons should be tappable, and no content should overflow or be clipped.

Answer questions 7–8 in [`QUESTIONS.md`](QUESTIONS.md).
