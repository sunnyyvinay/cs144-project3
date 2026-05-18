# Questions

Answer each question below. Replace the blank lines with your response.

## Part 1: Database Optimization

**1. In general, writes such as changing grades should only occur on the smaller normalized tables. Explain why. Since SQLite does not support materialized views, we write to both the normalized and denormalized tables instead. What problem(s) could this introduce?**



**2. For each denormalized table you created, explain why you chose that specific set of columns. Why not include additional columns that might be useful later?**



**3. Why not skip denormalization and just add indexes to the normalized tables?**



**4. Which users should be able to read which data? Which users should be able to write which data? For each API endpoint, describe who should have access and what kind of access they should have.**



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

