import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const schemaDirectory = resolve(projectRoot, 'data', 'schemas')
const lessonDirectory = resolve(projectRoot, 'data', 'lessons')
const schemaFiles = [
  'vocabulary.schema.json',
  'exercise.schema.json',
  'card.schema.json',
  'scenario.schema.json',
  'lesson.schema.json',
]

export async function createLessonValidator() {
  const ajv = new Ajv({ allErrors: true, strict: true })
  addFormats(ajv)
  for (const fileName of schemaFiles) {
    const schema = JSON.parse(await readFile(resolve(schemaDirectory, fileName), 'utf8'))
    ajv.addSchema(schema)
  }

  const validate = ajv.getSchema('https://ari.language/schemas/lesson.schema.json')
  if (!validate) throw new Error('Could not load the lesson JSON schema.')
  return validate
}

export async function readLessonFiles() {
  const names = (await readdir(lessonDirectory))
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
  if (names.length === 0) throw new Error(`No lesson JSON files found in ${lessonDirectory}.`)
  return Promise.all(names.map(async (fileName) => ({
    fileName,
    lesson: JSON.parse(await readFile(resolve(lessonDirectory, fileName), 'utf8')),
  })))
}

async function main() {
  const validate = await createLessonValidator()
  const lessons = await readLessonFiles()
  let invalidCount = 0

  for (const { fileName, lesson } of lessons) {
    if (validate(lesson)) {
      const reviewState = lesson.reviewed ? 'reviewed' : 'UNREVIEWED — do not show to learners'
      console.log(`PASS ${fileName} (${reviewState})`)
    } else {
      invalidCount += 1
      console.error(`FAIL ${fileName}`)
      for (const issue of validate.errors ?? []) {
        console.error(`  ${issue.instancePath || '/'} ${issue.message ?? 'is invalid'}`)
      }
    }
  }

  if (invalidCount > 0) {
    throw new Error(`${invalidCount} of ${lessons.length} lesson file(s) failed validation.`)
  }
  console.log(`Validated ${lessons.length} lesson file(s).`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
