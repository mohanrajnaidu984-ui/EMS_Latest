# EMS Application - IT Department Handover Document

## 1. Document Control
- Application Name: Enquiry Management System (EMS)
- Handover Type: Application + source code + deployment operations
- Primary Stack: React (Vite) + Node.js/Express + Microsoft SQL Server
- Prepared For: IT Operations / Infrastructure / Application Support

## 2. Handover Scope
This handover covers:
- Source code locations and ownership boundaries
- Environment and infrastructure prerequisites
- Build, run, deployment, rollback, and validation procedures
- Database setup and migration notes
- Security and access expectations
- Operations runbook (logs, restart, troubleshooting)

Not in scope:
- Business process training for non-IT users
- Functional change requests and feature backlog planning

## 3. Source Code Inventory
Primary application root:
- `EMS/`

Main source code components:
- Frontend (React/Vite): `EMS/src`
- Backend (Node/Express): `EMS/server`
- DB scripts: `EMS/database`
- Deployment-ready package: `EMS/deployment_package`
- Deployment helper script: `EMS/scripts/prepare_deploy.cjs`

Documentation and run guides:
- `EMS/README.md`
- `EMS/DEPLOYMENT.md`
- `EMS/deployment_package/DEPLOYMENT_GUIDE.md`
- `EMS/README-RAG.md`
- `EMS/UPDATE_GUIDE.md`

Note on additional codebase:
- A separate .NET solution exists in `EMS/EMS_Solution` (`EMS.API`, `EMS.Web`).
- This should be explicitly classified by IT as either:
  - active production component, or
  - legacy/archived component.

## 4. Technology Stack
- Frontend: React 19, Vite, ESLint
- Backend: Node.js (CommonJS), Express, `mssql`, `msnodesqlv8`, `multer`, `nodemailer`, `bcryptjs`, `dotenv`
- Database: Microsoft SQL Server
- AI/RAG related modules: Gemini/OpenAI libraries, local vector storage service (`server/services/vectorDb.js`)
- Optional vector infra file present: `docker-compose.yml` (Qdrant service definition)
- Web hosting: IIS (frontend/reverse proxy) + PM2 (backend process manager)

## 5. Environment & Configuration
### 5.1 Backend environment file
Location:
- `EMS/server/.env`

Minimum required variables (names only):
- `DB_USER`
- `DB_PASSWORD`
- `DB_SERVER`
- `DB_DATABASE`
- `PORT`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`

Variables referenced in additional features/scripts:
- `ENQUIRY_ATTACHMENTS_ROOT`
- `EMS_ATTACHMENTS_ROOT`
- `ENQUIRY_ATTACHMENTS_PUBLIC_ROOT`
- `ENQUIRY_ATTACHMENTS_PRIVATE_ROOT`
- `GEMINI_API_KEY`
- `DB_NAME`
- `DB_CONNECTION_STRING`
- `ENQUIRY_DEBUG_LOG`
- `QUOTE_PDF_ASSET_ORIGIN`
- `DEBUG_QUOTE_PDF_HTML`
- `PUPPETEER_EXECUTABLE_PATH`

### 5.2 Frontend environment variable
- `VITE_API_BASE` (used in pricing/probability components)

### 5.3 Security handling requirement
- Do not store production secrets in version control.
- Maintain environment values in secure IT-managed secret storage.
- Restrict read access to `.env` files to app support admins only.

## 6. Prerequisites (Server)
- Windows Server with IIS role installed
- Node.js LTS (v18+ minimum; v20 preferred)
- SQL Server connectivity to target EMS database
- IIS URL Rewrite module
- IIS Application Request Routing (ARR)
- PM2 installed globally (`npm install -g pm2`)
- Optional: SSMS for database administration

## 7. Build & Run Procedures
### 7.1 Local development
Frontend:
- `cd EMS`
- `npm install`
- `npm run dev`

Backend:
- `cd EMS/server`
- `npm install`
- `node index.js` (or `npm start` from server package scripts)

### 7.2 Production startup (recommended)
- `cd C:\inetpub\wwwroot\EMS\server`
- `npm install --production`
- `pm2 start index.js --name "EMS-API"`
- `pm2 save`
- `pm2 startup` (run generated command for reboot persistence)

## 8. Deployment Architecture (IIS + Node)
- IIS hosts static frontend from `client` (or `Frontend`) directory.
- IIS reverse proxies `/api/*` calls to Node backend (`http://localhost:<PORT>/api/*`).
- Node backend connects to SQL Server and handles business/API logic.

Suggested server layout:
- `C:\inetpub\wwwroot\EMS\client`
- `C:\inetpub\wwwroot\EMS\server`

Folder permission requirements:
- Read permissions for IIS identities on app root
- Modify/Write on `server/uploads` and `server/logs` (if used)

## 9. Database Handover Notes
Primary SQL scripts:
- `EMS/database/schema.sql`
- `EMS/database/create_quotes_tables.sql`
- `EMS/database/cleanup_duplicates.sql`
- `EMS/database/check_email.sql`

Backend migration scripts:
- `EMS/server/migrations/*`
- Additional helper scripts in `EMS/server` (naming: `migrate_*`, `run_migration*`, `update_*`)

Operational requirement:
- Run database changes in controlled change windows.
- Capture pre-change backup and post-change verification evidence.

## 10. Operational Runbook (IT Support)
### 10.1 Service health checks
- `pm2 status` -> verify `EMS-API` is online
- `pm2 logs EMS-API` -> check runtime errors
- Browser/API smoke test -> verify frontend and `/api` responses

### 10.2 Restart procedure
- `pm2 restart EMS-API`
- If config changed: `pm2 restart EMS-API --update-env`

### 10.3 Incident triage order
1. IIS site binding and app pool state
2. Reverse proxy rewrite rule (`/api` routing)
3. PM2 process health and logs
4. DB connectivity and SQL authentication/network
5. SMTP/API-key dependent feature errors

## 11. Backup and Rollback
Minimum backup scope before release:
- `client` deployed folder
- `server` deployed folder
- Server `.env` (secure copy; encrypted and access controlled)
- Database backup/snapshot

Rollback trigger examples:
- Critical API failure after deploy
- Data integrity issue
- Authentication/authorization regression

Rollback steps:
1. Stop or switch traffic from current release.
2. Restore prior `client` and `server` folders.
3. Restore previous DB backup if schema/data change introduced issue.
4. Restart PM2 process.
5. Execute smoke tests and validate business-critical flows.

## 12. Post-Deployment Validation Checklist
- Application UI loads from IIS URL
- User login works
- Enquiry create/update/search works
- Attachment upload and retrieval works
- Email sending works (if enabled in environment)
- Reporting/analytics endpoints return valid results
- PM2 process remains stable for at least 24 hours

## 13. Known Risks / Gaps to Close
- Mixed architecture footprint (`EMS` Node/React + `EMS_Solution` .NET) needs explicit ownership classification.
- Multiple deployment docs use inconsistent naming (`DB_PASS`/`DB_NAME` vs `DB_PASSWORD`/`DB_DATABASE`); IT should standardize one canonical env contract.
- Large number of ad-hoc debug/verification scripts in `server` can cause operational ambiguity; define approved operational scripts list.
- Monitoring/alerting appears basic (primarily PM2 logs); add centralized logging/alerts for production readiness.
- Ensure secrets are rotated and removed from any unintended source-controlled files.

## 14. IT Ownership Matrix (Fill During Transition)
- Application Owner:
- Technical Owner:
- Infrastructure Owner:
- Database Owner:
- Security Owner:
- L1/L2 Support Team:
- Escalation Contact:
- Change Advisory Board Reference:

## 15. Final Handover Deliverables Checklist
- [ ] Complete source code package delivered (`EMS` folder and confirmed subfolders)
- [ ] Deployment and rollback runbooks validated on target server
- [ ] Environment variable template shared (without secret values)
- [ ] Database scripts and execution order documented
- [ ] Production access credentials transferred via approved secure channel
- [ ] Support contacts and escalation matrix approved
- [ ] Sign-off from IT Operations, Application Team, and Project Owner

## 16. Recommended Immediate Next Actions
1. Approve this document as the canonical handover baseline.
2. Add an `.env.example` file in `EMS/server` with variable names only.
3. Define one authoritative deployment document and archive duplicates.
4. Clean or archive non-operational debug scripts from production package.
5. Run a formal dry-run deployment and rollback with IT team before go-live.

