import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

function SlidesIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function RecordingIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function safeUrl(url) {
  const s = String(url ?? '#').trim();
  if (s === '#' || s.startsWith('/') || s.startsWith('https://') || s.startsWith('http://')) return s;
  return '#';
}

function ModuleEntry({ entry }) {
  const isSlides = entry.type === 'slides';
  return (
    <a href={safeUrl(entry.url)} className="material-link">
      <span className={`material-icon ${isSlides ? 'icon-slides' : 'icon-recording'}`}>
        {isSlides ? <SlidesIcon /> : <RecordingIcon />}
      </span>
      <span>{entry.title}</span>
    </a>
  );
}

function Module({ week }) {
  const [expanded, setExpanded] = useState(true);
  const collapsedClass = expanded ? '' : ' collapsed';
  const sortedEntries = [...week.entries].sort((a, b) => a.sort - b.sort);

  return (
    <div className="module-section" id={`week-${week.id}`}>
      <div className={`module-header${collapsedClass}`} onClick={() => setExpanded(e => !e)}>
        <h3>{week.title}</h3>
        <span className="module-toggle">{'▼'}</span>
      </div>
      <div className={`module-body${collapsedClass}`}>
        <div className="lecture-group">
          {sortedEntries.map(entry => (
            <ModuleEntry key={entry.id} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CourseContent({ weeks }) {
  return (
    <>
      {weeks.map(week => <Module key={week.id} week={week} />)}
    </>
  );
}

// Bridge to vanilla JS: course.js fetches the data, builds the sidebar (which
// stays vanilla per the assignment), and calls this with the parsed weeks.
// We tear down any prior root first because grades.js wipes the container's
// innerHTML when the user switches to the Grades view, which would leave a
// stale React root pointing at detached DOM.
const roots = new WeakMap();

window.mountCourseContent = function mountCourseContent(container, weeks) {
  const prior = roots.get(container);
  if (prior) {
    prior.unmount();
    roots.delete(container);
  }
  const root = createRoot(container);
  roots.set(container, root);
  root.render(<CourseContent weeks={weeks} />);
};

window.unmountCourseContent = function unmountCourseContent(container) {
  const prior = roots.get(container);
  if (prior) {
    prior.unmount();
    roots.delete(container);
  }
};
