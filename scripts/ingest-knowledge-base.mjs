import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = resolve(root, 'data', 'knowledge-base')
const maxDownloadBytes = 100 * 1024 * 1024
const timeoutMs = 45_000

function parseArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const [key, inlineValue] = args[index].split('=')
    if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${args[index]}`)
    const value = inlineValue ?? args[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`)
    options[key.slice(2)] = value
    if (inlineValue === undefined) index += 1
  }
  return options
}

function cleanContent(content) {
  return String(content)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function dedupeKey(record) {
  return [record.language, record.level, record.section, record.skill, cleanContent(record.content)]
    .map((part) => String(part).normalize('NFKC').toLocaleLowerCase())
    .join('\u0000')
}

function hostAllowed(url, sourceUrl) {
  const candidate = new URL(url)
  const registered = new URL(sourceUrl)
  return candidate.protocol === 'https:' && (
    candidate.hostname === registered.hostname ||
    candidate.hostname.endsWith(`.${registered.hostname}`) ||
    registered.hostname === 'tatoeba.org' && candidate.hostname === 'downloads.tatoeba.org'
  )
}

export async function downloadSource(url, destination, source, fetcher = fetch) {
  if (!hostAllowed(url, source.url)) throw new Error('Download host does not match the registered source host.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetcher(url, { signal: controller.signal, redirect: 'error' })
    if (!response.ok) throw new Error(`Source download failed with HTTP ${response.status}.`)
    const declaredLength = Number(response.headers.get('content-length') || 0)
    if (declaredLength > maxDownloadBytes) throw new Error('Source download exceeds the 100 MiB limit.')
    const data = Buffer.from(await response.arrayBuffer())
    if (data.length > maxDownloadBytes) throw new Error('Source download exceeds the 100 MiB limit.')
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, data, { flag: 'wx' })
    return data.length
  } finally {
    clearTimeout(timer)
  }
}

function validateSource(record, source) {
  if (!source) throw new Error(`Unregistered source: ${record.source_name}`)
  if (!record.source_url.startsWith(source.url)) throw new Error(`Record source URL does not match the registered ${source.name} source.`)
  const expectedLicencePrefix = source.licence.split(' (')[0]
  if (!record.licence.toLocaleLowerCase().startsWith(expectedLicencePrefix.toLocaleLowerCase())) {
    throw new Error(`Licence mismatch for ${source.name}; record the exact applicable licence.`)
  }
  if (source.id === 'tatoeba') {
    if (!record.author || !record.sentence_url) throw new Error('Tatoeba records require author and direct sentence-page attribution.')
    if (record.proofread_status !== 'OK' || record.naturalness_review !== 'approved') {
      record.quality_flag = record.proofread_status === 'unproofread' ? 'unproofread' : 'unreviewed'
    }
  }
  if (record.audio_url && (!record.audio_licence || !record.audio_attribution_text)) {
    throw new Error('Audio cannot be imported without its own licence and attribution.')
  }
  if (source.id === 'cefr-companion' && record.quality_flag === 'approved') {
    throw new Error('CEFR-derived reference records must not be approved as copied instructional content.')
  }
  if (source.id === 'fsi-courses') {
    record.quality_flag = 'unreviewed'
    record.notes = [record.notes, 'DATED SOURCE: use for lesson structure/drills only; check modern usage before teaching.'].filter(Boolean).join(' ')
  }
  if (source.status.startsWith('verify') && record.quality_flag === 'approved') {
    throw new Error(`${source.name} has unresolved licence status; verify the release/host before approving imports.`)
  }
  return record
}

export async function ingestRecords({ inputPath, sources, validateRecord, defaults = {} }) {
  const lines = (await readFile(inputPath, 'utf8')).split(/\r?\n/).filter((line) => line.trim())
  const records = []
  const ids = new Set()
  const contentKeys = new Set()
  for (const [index, line] of lines.entries()) {
    let record
    try {
      record = JSON.parse(line)
    } catch {
      throw new Error(`Invalid JSON on input line ${index + 1}.`)
    }
    const source = sources.find((entry) => entry.name === record.source_name)
    for (const field of ['language', 'level', 'section', 'skill']) {
      if (!record[field] && defaults[field]) record[field] = defaults[field]
    }
    validateSource(record, source)
    record.content = cleanContent(record.content)
    if (!record.content) throw new Error(`Record on line ${index + 1} has no content after cleaning.`)
    if (!validateRecord(record)) {
      const detail = validateRecord.errors?.map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ')
      throw new Error(`Record on line ${index + 1} violates the knowledge schema: ${detail}`)
    }
    if (ids.has(record.id)) throw new Error(`Duplicate record id: ${record.id}`)
    ids.add(record.id)
    const key = dedupeKey(record)
    if (contentKeys.has(key)) continue
    contentKeys.add(key)
    records.push(record)
  }
  return records
}

export function buildKnowledgeIndex(records) {
  const index = {}
  for (const record of records) {
    const key = [record.language.toLocaleLowerCase(), record.level, record.section, record.skill].join('|')
    ;(index[key] ??= []).push(record.id)
  }
  return index
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const sourceCatalog = JSON.parse(await readFile(resolve(dataDir, 'sources.json'), 'utf8'))
  if (options['download-url']) {
    const source = sourceCatalog.find((entry) => entry.id === options['download-source'])
    if (!source) throw new Error('Provide a registered --download-source.')
    const destination = resolve(root, options['download-to'] || 'data/knowledge-base/staging/source.download')
    const bytes = await downloadSource(options['download-url'], destination, source)
    console.log(`Downloaded ${bytes} bytes to ${destination}. Review the source terms and normalize it to attributed JSONL before ingestion.`)
    return
  }
  if (!options.input) throw new Error('Usage: node scripts/ingest-knowledge-base.mjs --input <attributed-records.jsonl>')
  const schema = JSON.parse(await readFile(resolve(dataDir, 'record.schema.json'), 'utf8'))
  const ajv = new Ajv({ allErrors: true, strict: true })
  addFormats(ajv)
  const validateRecord = ajv.compile(schema)
  const inputPath = resolve(root, options.input)
  const records = await ingestRecords({
    inputPath,
    sources: sourceCatalog,
    validateRecord,
    defaults: {
      language: options.language,
      level: options.level,
      section: options.section,
      skill: options.skill,
    },
  })
  const outputPath = resolve(dataDir, 'records.json')
  const indexPath = resolve(dataDir, 'index.json')
  await writeFile(outputPath, `${JSON.stringify(records, null, 2)}\n`, { flag: 'w' })
  await writeFile(indexPath, `${JSON.stringify(buildKnowledgeIndex(records), null, 2)}\n`, { flag: 'w' })
  console.log(`Indexed ${records.length} unique record(s) to ${outputPath}. Unapproved records remain excluded from retrieval.`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
