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


**SQL Injection:**


**Command Injection:**


**Cross-Site Scripting (XSS):**


**Broken Authentication:**


**Broken Access Control:**


**Cross-Site Request Forgery (CSRF):**


**Dependency Vulnerabilities:**





## Part 3: React

**5. Where does the expanded/collapsed state for each module live in your component hierarchy? Why did you put it there?**



**6. What did React make easier compared to the vanilla JavaScript implementation? What did it make harder?**



## Part 4: Responsive Design

**7. For each media query breakpoint, explain why you chose that specific cutoff value and what layout or usability problem it solves. Describe the changes you made at each breakpoint in terms of the user experience (e.g. "the sidebar collapses into a hamburger menu because there isn't enough horizontal space to show it alongside the content"), not just the CSS properties you changed.**



**8. If you used AI for this part, what did you prompt it with, and what did you have to fix or adjust by hand?**

