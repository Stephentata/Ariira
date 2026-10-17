import test from 'node:test'
import assert from 'node:assert/strict'
import { initialTheme } from '../src/theme-preference.js'

test('theme follows an explicit saved choice before the system preference', () => {
  const dark = { getItem: () => 'dark' }
  const light = { getItem: () => 'light' }
  const unset = { getItem: () => null }
  assert.equal(initialTheme(dark, false), 'dark')
  assert.equal(initialTheme(light, true), 'light')
  assert.equal(initialTheme(unset, true), 'dark')
  assert.equal(initialTheme(unset, false), 'light')
})
