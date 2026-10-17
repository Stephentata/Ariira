import { useMemo, useState } from 'react'
import { getKnowledgeCoverage } from './knowledge-base.js'
import { KNOWLEDGE_SECTIONS } from './teaching-layer.js'
import { LANGUAGES } from './language-options.js'
import './KnowledgeAdmin.css'

export default function KnowledgeAdmin() {
  const [languageCode, setLanguageCode] = useState(LANGUAGES[0].code)
  const coverage = useMemo(
    () => getKnowledgeCoverage(LANGUAGES, KNOWLEDGE_SECTIONS),
    [],
  )
  const selected = coverage.languages.find((language) => language.code === languageCode)

  return (
    <section className="knowledge-admin settings-card" aria-labelledby="knowledge-admin-title">
      <div className="settings-section-intro">
        <p className="eyebrow">DEVELOPMENT · CURRICULUM ADMIN</p>
        <h3 id="knowledge-admin-title">Knowledge coverage</h3>
        <p>Only approved records can ground tutor turns. Empty sections are gaps, not assumed coverage.</p>
      </div>
      <div className="knowledge-admin-summary">
        <span><strong>{coverage.approvedRecords}</strong> approved records</span>
        <span><strong>{coverage.unreviewedRecords}</strong> awaiting review</span>
        <span><strong>{coverage.gaps.length}</strong> language/section gaps</span>
      </div>
      <label className="knowledge-language-picker">Language
        <select value={languageCode} onChange={(event) => setLanguageCode(event.target.value)}>
          {LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}
        </select>
      </label>
      <div className="knowledge-coverage-table" role="table" aria-label="Selected language section coverage">
        <div role="row" className="knowledge-coverage-row is-header"><strong role="columnheader">Section</strong><strong role="columnheader">Approved records</strong><strong role="columnheader">Coverage</strong></div>
        {selected?.sections.map((entry) => (
          <div role="row" className="knowledge-coverage-row" key={entry.section}>
            <span role="cell">{entry.section}</span><span role="cell">{entry.count}</span>
            <span role="cell" className={entry.count ? 'has-coverage' : 'no-coverage'}>{entry.count ? 'Available' : 'Gap'}</span>
          </div>
        ))}
      </div>
      <div className="knowledge-sources">
        <h4>Source register</h4>
        {coverage.sources.map((source) => (
          <article key={source.id}>
            <a href={source.url} target="_blank" rel="noreferrer">{source.name}</a>
            <span>{source.status}</span>
            <small>{source.licence}</small>
            <small>{source.usage_note}</small>
          </article>
        ))}
      </div>
    </section>
  )
}
