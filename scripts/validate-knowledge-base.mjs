import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = resolve(root, 'data', 'knowledge-base')

async function main() {
  const [schema, records, sources] = await Promise.all([
    readFile(resolve(directory, 'record.schema.json'), 'utf8').then(JSON.parse),
    readFile(resolve(directory, 'records.json'), 'utf8').then(JSON.parse),
    readFile(resolve(directory, 'sources.json'), 'utf8').then(JSON.parse),
  ])
  const ajv = new Ajv({ allErrors: true, strict: true })
  addFormats(ajv)
  const validate = ajv.compile(schema)
  const ids = new Set()
  for (const record of records) {
    if (!validate(record)) throw new Error(`Invalid ${record.id}: ${validate.errors?.map((issue) => issue.message).join('; ')}`)
    if (ids.has(record.id)) throw new Error(`Duplicate knowledge record id: ${record.id}`)
    ids.add(record.id)
    if (!sources.some((source) => source.name === record.source_name && record.source_url.startsWith(source.url))) {
      throw new Error(`Knowledge record ${record.id} has no matching registered source.`)
    }
    if (record.quality_flag === 'approved' && record.source_name === 'Tatoeba' &&
      (record.proofread_status !== 'OK' || record.naturalness_review !== 'approved' || !record.author || !record.sentence_url)) {
      throw new Error(`Tatoeba record ${record.id} is not eligible for approved retrieval.`)
    }
    if (record.audio_url && (!record.audio_licence || !record.audio_attribution_text)) {
      throw new Error(`Audio record ${record.id} lacks independent audio attribution.`)
    }
  }
  console.log(`Knowledge base valid: ${records.length} record(s), ${records.filter((record) => record.quality_flag === 'approved').length} approved for retrieval.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
