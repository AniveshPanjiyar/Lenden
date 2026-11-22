# Work: attendance, tasks and daily updates

Tab `work`. Data: `work_attendance`, `work_tasks`, `work_updates`; read through
`/api/businesses/[businessId]/work`.

- **Attendance:** `checkIn` / `checkOut`. An automatic check-out at 7 PM (India time) runs through `lenden_auto_checkout`. The Owner sees everyone's attendance.
- **Tasks:** `createWorkTask` (title, assignee, due date, notes). Stages move forward with `setWorkTaskStatus`, and **only the assignee** can move their task. The list shows your own tasks by default.
- **Daily updates:** `postWorkUpdate` / `deleteWorkUpdate`, a short work log.
- Blocked in support mode.
