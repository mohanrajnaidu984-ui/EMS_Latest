# Scope of Work — Enquiry Management System (EMS)

**Client:** Almoayyed Contracting Group  
**Document Type:** Tender Scope of Work  
**Date:** August 2026  
**Prepared by:** Mohan Naidu

---

## 1. Project Overview

The Enquiry Management System (EMS) is a custom, full-stack web application that manages the complete sales and enquiry lifecycle for Almoayyed Contracting Group — from initial customer contact through pricing, formal quotation, multi-level approval, pipeline tracking, and management reporting.

The system is to be developed as an internal enterprise platform accessible via a web browser, hosted on company infrastructure, and integrated with the organisation's Microsoft SQL Server database environment.

---

## 2. Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 (JSX / TSX) |
| Backend | Node.js 22, Express 5 |
| Database | Microsoft SQL Server |
| Authentication | JWT-based session management |
| Email Integration | SMTP / Outlook draft generation |
| PDF Export | Server-side A4 protected PDF rendering |
| Deployment | IIS (Windows Server) |

---

## 3. Modules & Functional Scope

### Module 1 — Authentication & User Management
- Email-based login with hashed password storage
- First-time password setup flow
- Role-based access control (Admin, Sales Engineer, Division Manager, Approver)
- User master management (`Master_ConcernedSE`)

---

### Module 2 — Enquiry Management (Core)
- Register new enquiries with full customer, stakeholder, and project details
- Assign multiple customers per enquiry (for split-quote scenarios)
- Assign Lead Job and Sub-Jobs with automatic Division/Department code derivation
- Upload and manage received documents and attachments
- Modify and version-track existing enquiries
- Auto-generate unique Enquiry (Request) Numbers
- Automated acknowledgement email on submission
- Enquiry search, filter, and status tracking

---

### Module 3 — Pricing Engine
- Load enquiry scope by Request Number
- Enter multi-line cost breakdowns (Material, Labour, Overheads) per job/item
- Support for Lead Job and Sub-Job pricing layers
- Per-customer pricing tabs for multi-customer enquiries
- Division-level access control for pricing data
- Validation: zero-value filtering, duplicate prevention
- Persist pricing to `PricingMaster` and `PricingDetail` tables

---

### Module 4 — Quoting System
- Generate formal quotations from approved pricing data
- Auto-construct quote reference in format: `DeptCode/DivCode/ReqNo-JobPrefix/QuoteNo-RevNo`
- Rich-text clause editor (Scope, Payment Terms, Warranty, Custom clauses)
- Clause reordering and editing within quote body
- A4-formatted print/preview layout
- Protected PDF export (print-only, no copy/edit)
- Draft and Final quote versioning
- Quote revision workflow (R0 → R1 → Rn)
- Customer-specific "To" address population

---

### Module 5 — Approval Workflow
- Multi-step approval routing based on job type and division
- Cross-division approver rule configuration
- Digital sign-off at each approval stage
- Full audit trail of approval actions and timestamps
- Email notifications to approvers at each stage

---

### Module 6 — Probability / Pipeline Tracking
- Record and update opportunity status: Won, Lost, Follow Up, On Hold, Cancelled, Retendered
- Assign ownership context (SE, Division) per opportunity
- Filter and view pipeline by status, SE, division, and date range

---

### Module 7 — Dashboard & Analytics
- KPI summary cards: Active Enquiries, Pending Quotes, Approvals Pending
- Dual calendar views for enquiry and quote due dates
- Division and Sales Engineer filter controls
- Enquiry drill-down from dashboard tiles

---

### Module 8 — Sales Reports & Targets
- Performance charts: individual and division-level
- Top-jobs analysis by value
- Goal vs. actual tracking against defined sales targets
- Excel export for reporting

---

### Module 9 — Notifications & Integrations
- In-app notification centre for workflow events
- SMTP email triggers (acknowledgements, approvals, reminders)
- Outlook draft generation for manual review before sending
- OCR-assisted contact capture from uploaded documents

---

### Module 10 — System Administration
- Master data management: Customers, Services/Divisions, Users, Clauses
- Database schema management and migration scripts
- Deployment configuration for IIS/Windows Server
- Help module for user guidance

---

## 4. Database Scope

- Design and delivery of full relational schema on Microsoft SQL Server
- Minimum 35–40 tables covering master data, transactional records, audit logs, and configuration
- Migration scripts for version-controlled schema evolution
- Stored procedures / views as required for reporting queries

---

## 5. Non-Functional Requirements

| Requirement | Expectation |
|-------------|------------|
| Concurrent users | Up to 50 internal users |
| Browser support | Chrome, Edge (latest 2 versions) |
| Uptime | Business hours availability; hosted on-premise |
| Security | Role-based access, hashed credentials, no public exposure |
| PDF export | Password-protected, print-only |
| Data residency | On-premise MS SQL Server; no cloud data storage |

---

## 6. Deliverables

1. Full source code (React frontend, Node.js/Express backend)
2. Database schema scripts and seed/migration files
3. IIS deployment guide and configuration files
4. User manual / onboarding documentation
5. System administration guide
6. 3-month post-go-live support period

---

## 7. Estimated Effort & Timeline

| Phase | Description | Duration |
|-------|-------------|----------|
| Phase 1 | Requirements finalisation, UI/UX design, DB schema | 4–6 weeks |
| Phase 2 | Core modules: Auth, Enquiry, Pricing | 10–14 weeks |
| Phase 3 | Quote, Approval Workflow, Notifications | 10–14 weeks |
| Phase 4 | Dashboard, Pipeline, Sales Reports | 6–8 weeks |
| Phase 5 | Integration, testing, UAT, deployment | 6–8 weeks |
| **Total** | | **~18–24 months (full team) / 12–15 months (accelerated)** |

---

## 8. Commercial Estimate

| Item | Range (BHD) |
|------|:-----------:|
| One-time development (full scope) | 45,000 – 60,000 |
| Annual support & maintenance | 5,000 – 8,000 / year |
| Optional — training & onboarding | 1,500 – 3,000 |

*Estimates are based on GCC market rates for enterprise custom web application development. Final pricing subject to detailed requirements review.*

---

## 9. Exclusions

- Mobile application (iOS / Android) — web responsive only
- ERP or third-party system integration (unless separately scoped)
- Cloud hosting or SaaS infrastructure
- HR, payroll, or finance module functionality

---

*This Scope of Work is prepared as a basis for tender evaluation. Final scope, timelines, and commercial terms are subject to negotiation and sign-off by both parties.*
