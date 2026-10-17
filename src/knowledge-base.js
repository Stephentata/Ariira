import records from '../data/knowledge-base/records.json' with { type: 'json' }
import sources from '../data/knowledge-base/sources.json' with { type: 'json' }

export const KNOWLEDGE_RECORDS = Object.freeze(records)
export const KNOWLEDGE_SOURCES = Object.freeze(sources)
export const KNOWLEDGE_INDEX = Object.freeze(Object.fromEntries(
  KNOWLEDGE_RECORDS.reduce((index, record) => {
    const key = [record.language.toLocaleLowerCase(), record.level, record.section, record.skill].join('|')
    index.set(key, [...(index.get(key) || []), record.id])
    return index
  }, new Map()),
))

export function getKnowledgeCoverage(languages = [], sections = [], knowledgeRecords = KNOWLEDGE_RECORDS) {
  const languageRows = languages.map((language) => ({
    code: language.code,
    name: language.name,
    sections: sections.map((section) => ({
      section,
      count: knowledgeRecords.filter((record) =>
        record.language.toLocaleLowerCase() === language.name.toLocaleLowerCase() &&
        record.section === section &&
        record.quality_flag === 'approved',
      ).length,
    })),
  }))
  return {
    languages: languageRows,
    approvedRecords: knowledgeRecords.filter((record) => record.quality_flag === 'approved').length,
    unreviewedRecords: knowledgeRecords.filter((record) => record.quality_flag !== 'approved' && record.quality_flag !== 'rejected').length,
    gaps: languageRows.flatMap((language) => language.sections
      .filter((entry) => entry.count === 0)
      .map((entry) => ({ language: language.name, section: entry.section }))),
    sources: KNOWLEDGE_SOURCES,
  }
}
