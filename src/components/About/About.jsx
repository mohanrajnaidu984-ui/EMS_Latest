import React from 'react';

const appSections = [
  {
    label: 'Dashboard',
    icon: 'bi-speedometer2',
    description:
      'Dual calendar views with monthly overview (Enquiry Received, Due, Lapsed, Quoted). Filter by division and sales engineer. Click day chips or monthly bars to open matching enquiry lists. Due and Lapsed counts reflect open enquiries without quotes, using the same logic in the calendar and popups.',
  },
  {
    label: 'Enquiry',
    icon: 'bi-clipboard-data',
    description:
      'Register and modify enquiries with customers, received-from contacts, enquiry-for hierarchy, concerned SEs, attachments, and status. On add enquiry, an internal Outlook notification can be sent to all concerned SEs. Optional customer acknowledgement opens Outlook drafts (one per customer) when "Send acknowledgement mail" is selected with a point-of-contact SE.',
  },
  {
    label: 'Pricing',
    icon: 'bi-calculator',
    description:
      'Commercial evaluation with job hierarchy, base price and options, and summary views linked to enquiry scope. Supports validation before quote preparation.',
  },
  {
    label: 'Quote',
    icon: 'bi-file-earmark-text',
    description:
      'Formal customer quotes with clause editor, A4 preview, lead job mapping, revisions, and pricing summary tables. Download protected PDF or open Outlook draft with quote PDF attached. Preview matches PDF layout for cover letter, headers, and clause content.',
  },
  {
    label: 'Probability',
    icon: 'bi-graph-up',
    description:
      'Pipeline status (Won, Lost, Follow Up, On Hold, Cancelled, Retendered) with status-specific fields, remarks, and ownership context for sales discipline.',
  },
  {
    label: 'Sales Report',
    icon: 'bi-file-earmark-bar-graph',
    description:
      'Performance insights with division/SE filters, charts, top-jobs tables, and status-based analysis across quoted, won, lost, and follow-up opportunities.',
  },
  {
    label: 'Sales Target',
    icon: 'bi-bullseye',
    description:
      'Planned goals versus actual achievement by period, with progress and gap visibility for forecasting and accountability.',
  },
];

export default function About() {
  return (
    <div className="py-3 d-flex justify-content-center">
      <div className="card border-0 shadow-sm" style={{ width: '50%', minWidth: '320px', maxWidth: '100%' }}>
        <div className="card-body p-4">
          <h4 className="mb-3" style={{ color: '#20396D', fontWeight: 700 }}>
            About EMS
          </h4>
          <div className="text-secondary mb-3">
            <p className="mb-2">
              EMS (Enquiry Management System) is a unified sales and enquiry platform built for Almoayyed
              Contracting Group. It connects every stage of the opportunity lifecycle—from first customer
              contact through pricing, quotation, pipeline follow-up, and management reporting—so teams
              work from one consistent record instead of scattered spreadsheets or emails.
            </p>
            <p className="mb-0">
              The application is designed for division-based sales operations. Sales engineers capture
              enquiries with full customer and project context; tender teams prepare structured
              estimates; quotes are issued with controlled PDF output and optional Outlook delivery;
              pipeline status is maintained in Probability; and management reviews performance through
              Sales Report and Sales Target.
            </p>
          </div>

          <div className="mb-2">
            <h6 className="mb-1" style={{ color: '#20396D', fontWeight: 700 }}>Application Sections</h6>
            <div className="text-secondary">
              {appSections.map((section, index) => (
                <p key={section.label} className={index === appSections.length - 1 ? 'mb-0' : 'mb-2'}>
                  <strong className="d-inline-flex align-items-center">
                    <i
                      className={`bi ${section.icon} me-2`}
                      style={{ color: '#20396D', fontSize: '1rem' }}
                      aria-hidden="true"
                    />
                    {section.label}:
                  </strong>{' '}
                  {section.description}
                </p>
              ))}
            </div>
          </div>

          <hr className="my-3" />
          <p className="mb-1 text-secondary">
            This application is the property of Almoayyed Contracting Group.
          </p>
          <p className="mb-0" style={{ color: '#20396D', fontWeight: 600 }}>
            Developed by Mohan Naidu
          </p>
        </div>
      </div>
    </div>
  );
}

