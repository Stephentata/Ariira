import test from 'node:test'
import assert from 'node:assert/strict'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildKnowledgeIndex, downloadSource, ingestRecords } from '../scripts/ingest-knowledge-base.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const schema = JSON.parse(await readFile(resolve(root, 'data/knowledge-base/record.schema.json'), 'utf8'))
const ajv = new Ajv({ allErrors: true, strict: true })
addFormats(ajv)
const validateRecord = ajv.compile(schema)
const testSource = {
  id: 'synthetic',
  name: 'Synthetic test source',
  url: 'https://example.org/terms',
  licence: 'CC0-1.0',
  status: 'verified',
}

function record(id, content) {
  return {
    id,
    language: 'Spanish',
    level: 'A1',
    section: 'Food',
    skill: 'speaking',
    content,
    source_name: testSource.name,
    source_url: 'https://example.org/terms/demo',
    licence: 'CC0-1.0',
    attribution_text: 'Synthetic test fixture, CC0-1.0.',
    quality_flag: 'approved',
  }
}

async function withTempDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), 'ari-kb-test-'))
  try {
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('ingestion cleans markup, deduplicates normalized content, and creates a retrieval index', async () => {
  await withTempDirectory(async (directory) => {
    const path = join(directory, 'input.jsonl')
    await writeFile(path, [
      JSON.stringify(record('one', '<p>Quiero&nbsp; agua.</p>')),
      JSON.stringify(record('two', ' Quiero agua. ')),
    ].join('\n'))
    const records = await ingestRecords({ inputPath: path, sources: [testSource], validateRecord })
    assert.equal(records.length, 1)
    assert.equal(records[0].content, 'Quiero agua.')
    assert.deepEqual(buildKnowledgeIndex(records), {
      'spanish|A1|Food|speaking': ['one'],
    })
  })
})

test('records cannot use unregistered or mismatched source attribution', async () => {
  await withTempDirectory(async (directory) => {
    const path = join(directory, 'input.jsonl')
    await writeFile(path, JSON.stringify({ ...record('one', 'Quiero agua.'), source_name: 'Unknown source' }))
    await assert.rejects(
      ingestRecords({ inputPath: path, sources: [testSource], validateRecord }),
      /Unregistered source/,
    )
    await writeFile(path, JSON.stringify({ ...record('one', 'Quiero agua.'), source_url: 'https://elsewhere.org/source' }))
    await assert.rejects(
      ingestRecords({ inputPath: path, sources: [testSource], validateRecord }),
      /source URL does not match/i,
    )
  })
})

test('Tatoeba needs author, sentence link, proofread status and naturalness approval', async () => {
  const tatoeba = {
    id: 'tatoeba',
    name: 'Tatoeba',
    url: 'https://tatoeba.org/en/terms_of_use',
    licence: 'CC BY 2.0 FR (confirm per sentence and export)',
    status: 'verify-per-record',
  }
  const draft = {
    ...record('tatoeba-1', 'Hola.'),
    source_name: 'Tatoeba',
    source_url: tatoeba.url,
    licence: 'CC BY 2.0 FR',
    author: 'Fixture author',
    sentence_url: 'https://tatoeba.org/en/sentences/show/1',
    proofread_status: 'unproofread',
    naturalness_review: 'unreviewed',
  }
  await withTempDirectory(async (directory) => {
    const path = join(directory, 'input.jsonl')
    await writeFile(path, JSON.stringify(draft))
    const records = await ingestRecords({ inputPath: path, sources: [tatoeba], validateRecord })
    assert.equal(records[0].quality_flag, 'unproofread')
  })
})

test('FSI imports remain unreviewed and dated after ingestion', async () => {
  const fsi = {
    id: 'fsi-courses',
    name: 'FSI Language Courses',
    url: 'https://fsi-languages.yojik.eu/',
    licence: 'Public domain',
    status: 'verify-per-file',
  }
  const draft = {
    ...record('fsi-1', 'A synthetic drill.'),
    source_name: fsi.name,
    source_url: `${fsi.url}course/example`,
    licence: 'Public domain',
  }
  await withTempDirectory(async (directory) => {
    const path = join(directory, 'input.jsonl')
    await writeFile(path, JSON.stringify(draft))
    const records = await ingestRecords({ inputPath: path, sources: [fsi], validateRecord })
    assert.equal(records[0].quality_flag, 'unreviewed')
    assert.match(records[0].notes, /DATED SOURCE/)
  })
})

test('downloads require HTTPS from the registered host and refuse redirects', async () => {
  await withTempDirectory(async (directory) => {
    const destination = join(directory, 'source.bin')
    const bytes = await downloadSource('https://example.org/terms/export.txt', destination, testSource, async () => ({
      ok: true,
      headers: { get: () => '4' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    }))
    assert.equal(bytes, 4)
    await assert.rejects(
      downloadSource('http://example.org/export', join(directory, 'no.bin'), testSource),
      /Download host/,
    )
    await assert.rejects(
      downloadSource('https://elsewhere.org/export', join(directory, 'no.bin'), testSource),
      /Download host/,
    )
  })
})
