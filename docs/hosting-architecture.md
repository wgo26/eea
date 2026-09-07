# Hosting Architecture

Status: approved baseline for deployment planning

## Decisions

| Area | Decision |
| --- | --- |
| Application hosting | Host the Next.js application through Hostinger Business Node.js hosting using the "Push your code, we host it" option. |
| Supabase | Connect to the existing hosted Supabase project over HTTPS. Do not run the Supabase stack inside the VPS. |
| Database and auth | Supabase remains the owner of PostgreSQL, Auth, RLS, Realtime, and Supabase Storage. |
| Public media | Cloudflare R2 remains the public media destination. |
| Admin media | Supabase Storage remains the admin asset destination. |
| Backup media | Backblaze B2 remains the backup destination. |
| Server operating system | Managed by Hostinger; no VPS operating-system administration is required. |
| Node.js | Node.js 22 LTS if available in the Business plan; otherwise use the newest Hostinger-supported LTS version. |
| Primary domain | `eagleeyeafrica.org`. |
| `www` host | `www.eagleeyeafrica.org` redirects to `https://eagleeyeafrica.org`. |
| Production branch | `master`, matching the current local branch. Rename it only as a separate, deliberate repository change. |
| Production approval | A production deployment requires an explicit human approval in the deployment workflow. |
| Staging | Use `staging.eagleeyeafrica.org` and a separate Supabase staging project. Never use production credentials for staging. |
| Reverse proxy and TLS | Managed by Hostinger. Configure the domain and HTTPS in hPanel. |
| Process supervision | Managed by Hostinger. Do not install systemd or PM2 on shared Business hosting. |
| Deployment model | Deploy the repository through Hostinger's Node.js application workflow or its supported Git integration. Confirm whether GitHub Actions deployment is supported by the plan before implementing it. |

## Environment mapping

The Hostinger Node.js application uses these production values:

- `NEXT_PUBLIC_SITE_URL=https://eagleeyeafrica.org`
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the production Supabase project
- `SUPABASE_SERVICE_ROLE_KEY` only on the server, never in browser code
- R2 credentials for public media
- B2 credentials for backup media
- `SUPABASE_ADMIN_ASSET_BUCKET=admin-asset`

The staging application uses the same variable names, but every Supabase, R2, and B2 resource must be staging-specific.

## Hostinger Business plan gate

Before deployment, verify in hPanel that the Business plan supports:

- Node.js server applications, not only static sites.
- Next.js server-side rendering with `next start`.
- Node.js 22 LTS, or the supported LTS version selected in this repository.
- A configurable build command: `npm ci && npm run build`.
- A configurable start command: `npm run start`.
- Production environment variables, including server-only secrets.
- HTTPS for `eagleeyeafrica.org` and `www.eagleeyeafrica.org`.
- A persistent application process after deployment.
- Enough memory and storage for the Next.js build.

If Hostinger Business only supports static exports or does not support a persistent Next.js server, stop before deployment and upgrade to a Hostinger VPS or another Node.js-compatible hosting plan. This application cannot be deployed as a static export because it uses server rendering, authentication callbacks, API routes, and server-side Supabase access.

## Required pre-deployment confirmations

- [ ] Hostinger Business Node.js support is confirmed for this account and plan.
- [ ] Hostinger supports the Next.js `build` and `start` commands required by this app.
- [ ] Hostinger supports server-side environment variables securely.
- [ ] The production domain is owned and DNS access is available.
- [ ] `eagleeyeafrica.org` is attached to the Hostinger application.
- [ ] `www.eagleeyeafrica.org` is attached and redirects to the primary domain.
- [ ] The production Supabase project is confirmed.
- [ ] A separate staging Supabase project exists.
- [ ] GitHub repository and Actions access are available.
- [ ] A human approver is assigned for production deployments.
- [ ] The exposed Supabase service-role key in the local `.env` has been revoked and replaced.
- [ ] Production Auth redirect URLs use the final HTTPS domain.
- [ ] The Hostinger deployment workflow is configured for the `master` branch.

## Branch policy

- Pull requests target `master`.
- CI must pass before merge.
- Production deployment runs only from `master`.
- Direct pushes to `master` should be disabled in the Git hosting provider.
- Production deployment approval should be required in the GitHub environment named `production`.
- Staging deployment may run automatically after merge, subject to the staging workflow.

## Current deployment path

Follow [deploy/hostinger-business.md](../deploy/hostinger-business.md). The required
actions are performed in hPanel: create the Node.js application, connect the repository,
select the Node.js version, configure build/start commands, add environment variables,
attach the domain, enable HTTPS, and run a production smoke test.

The old VPS bootstrap files under `deploy/vps/` are retained only as a future upgrade
path. Do not run them on Business shared hosting.

## Out of scope for this decision record

These are separate implementation tasks and must be completed before the first production deployment:

- VPS hardening, Nginx, TLS, process supervision, firewall configuration, and SSH deployment.
- GitHub Actions deployment until Hostinger confirms a supported integration for this plan.
- Supabase migrations and production schema verification.
- SMTP, Auth redirect URLs, Storage buckets, R2, and B2 configuration.
- Health checks, monitoring, rate limiting, and backup workers.

## Supabase step 4 status

The repository now includes an idempotent `admin-asset` Storage migration at
`supabase/migrations/20260907000000_admin_asset_storage.sql`. It creates the bucket,
sets the 5 MiB limit and MIME allowlist, permits public reads, and restricts writes,
updates, and deletes to staff. Apply the migration to the production project, then
complete the dashboard-only checklist in `deploy/hostinger-business.md`.
