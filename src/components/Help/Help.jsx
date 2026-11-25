import React from 'react';
import emsLogo from '../../assets/ems_logo_final.png';
import { getAcgBrandLogoSrc } from '../../utils/acgBrandLogo';
import { manualIntro, manualPages } from './manualPages';
import './Help.css';

export default function Help() {
  return (
    <div className="ems-help">
      <aside className="ems-help-contents">
        <h2>Contents</h2>
        <nav aria-label="Manual contents">
          <ol>
            {manualPages.map(({ title }, index) => (
              <li key={title}>
                <a href={`#ems-help-section-${index + 1}`}>{title}</a>
              </li>
            ))}
          </ol>
        </nav>
      </aside>

      <div className="ems-help-actions">
        <a className="ems-help-download" href={import.meta.env.BASE_URL + 'EMS-User-Manual.pdf'} download="EMS-User-Manual.pdf">
          <i className="bi bi-download" aria-hidden="true" />
          Download PDF
        </a>
      </div>

      <article className="ems-help-sheet" aria-labelledby="ems-help-title">
        <header className="ems-help-brand">
          <img src={emsLogo} alt="EMS Enquiry Management System" />
          <img src={getAcgBrandLogoSrc()} alt="Almoayyed Contracting Group" />
        </header>

        <h1 id="ems-help-title">EMS User Manual</h1>
        <p className="ems-help-intro">{manualIntro}</p>

        {manualPages.map(({ title, content }, index) => (
          <section className="ems-help-copy" key={title}>
            <h2 id={`ems-help-section-${index + 1}`} tabIndex={-1}>{title}</h2>
            {content}
          </section>
        ))}
      </article>
    </div>
  );
}
