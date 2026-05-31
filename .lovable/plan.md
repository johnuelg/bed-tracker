
Goal: Verify whether admin authentication is working now, and provide exact fallback steps if it is not.

Current verification result (based on code + recent auth/network activity):
1) Admin login is working:
- Password login request succeeded (200) via Supabase auth.
- Session token is being issued and used in subsequent requests.
2) Admin bootstrap is working:
- A profile row was created for the logged-in user.
- An admin role row was inserted and then read back (`role = admin`).
3) Admin-protected UI access is wired correctly:
- `/users` route is protected behind `RoleGuard allow={["admin"]}`.
- Admin-only actions call `admin-user-management` function and are role-gated in both UI and backend.

What to verify manually (end-to-end):
1) Sign in with your admin account.
2) Open `/users`:
- Expected: page loads (not redirected), “Create User” card visible.
3) Create a new staff user from `/users`:
- Expected: success toast, user appears in table.
4) Change that user’s role (e.g., staff → nurse):
- Expected: success toast, role persists after refresh.
5) Deactivate/reactivate that user:
- Expected: status toggles correctly.
6) Log out and sign in as the non-admin user:
- Expected: cannot access `/users`, `/categories`, `/form-builder`.

If admin auth is NOT working, fix steps (implementation plan):
1) Confirm role row exists for the account in `public.user_roles`.
2) If missing, insert admin role for that user (bootstrap policy supports first admin).
3) Validate `has_role` function and `RoleGuard` path access.
4) Validate `admin-user-management` edge function auth check + admin RPC check.
5) Retest create user / change role / activate-deactivate flow.

Technical details:
- Frontend guards: `ProtectedRoute` + `RoleGuard`.
- Role source: `useAuth` loads `user_roles` after session creation.
- Backend enforcement: edge function calls `has_role(auth.uid(), 'admin')` before admin actions.
- Defense-in-depth is present: route guard + API role checks + RLS policies.
