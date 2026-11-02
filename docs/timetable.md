# Personal weekly timetables

Open `#timetable` from the home card, desktop navigation, or the graduation-plan link.
Students can add courses manually, select courses from their existing scoped plan,
or extract a PDF/PNG/JPEG of up to 6 MiB using the configured Gemini/OpenAI service.

Extraction returns a review draft (up to 160 courses). Selecting a level or individual
courses and applying the draft appends them to the personal timetable (40 courses,
16 meetings per course). Missing days/times remain empty. The original file is not
archived or included in sharing. The student endpoint is `POST ?schedule=extract`,
using multipart `file` and an active verified `x-miyar-guest` session; authentication
precedes body reading. It shares the existing atomic guest/network/global AI quota.
Administrative plan publishing remains separately protected.

Timetables are saved locally per member or guest identity, not synchronized to a
server. A share link contains a validated static snapshot in `#timetable/v1.…`,
not in a query string. The public viewer requires no account or API calls, cannot
edit the owner's schedule, and can export its snapshot. Changing a saved timetable
does not change an older shared link. Maximum encoded payload is 20,000 characters.

PNG and one-page landscape PDF exports render Arabic using the locally loaded font.
Both include “مِعيار · miyar.website”; the PDF footer has a clickable link. The PDF
contains a raster image, not searchable text. Overlaps are flagged and displayed
in separate lanes in the export.

Validation:

- `node --test tests/timetable.test.js tests/assistant-guide.test.js`
- `npm run build && node tests/browser/timetable.cjs`
- `node tests/browser/session-lifecycle.cjs`
- `npm test`

The broad older `tests/browser/study.cjs` currently stops at its first institution
request because its guest fixture has no selected major and the mandatory major
modal intercepts clicks. The same failure was reproduced against the unchanged
pre-feature commit. The new browser test covers linking the existing scoped plan
into this timetable without changing that mandatory-major behavior.

Pushing the function files triggers the existing backend setup workflow. Its public
catalogue verification checks `features.studentTimetableImport` after deploying the
API. A separate GitHub Pages workflow builds and deploys the frontend.
