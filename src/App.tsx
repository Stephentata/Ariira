import { useState, type ReactNode } from 'react'
import LessonPlayer from './LessonPlayer'
import lessonPreview from '../data/lessons/zh-a1-u01-l01.json'
import './App.css'

type Page = 'home' | 'lesson' | 'tutor' | 'translate' | 'vocabulary' | 'progress' | 'settings'
type IconName =
  | 'home'
  | 'sparkles'
  | 'translate'
  | 'book'
  | 'chart'
  | 'settings'
  | 'arrow'
  | 'play'
  | 'mic'
  | 'swap'
  | 'volume'
  | 'clock'
  | 'check'
  | 'plus'
  | 'chevron'

const icons: Record<IconName, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-7h6v7" /></>,
  sparkles: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z" /><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" /></>,
  translate: <><path d="M4 5h12M10 3v2m3 0c-.5 4-3.5 7-7 9" /><path d="M6 9c1.5 2 3.5 3.5 6 4.5M14 20l4-9 4 9m-6.5-3h5" /></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Z" /><path d="M4 17a2.5 2.5 0 0 1 2.5-2.5H20M8 7h8" /></>,
  chart: <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 6-7" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4 1.4-1.1a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 1.9Z" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  play: <><path d="m8 5 12 7-12 7V5Z" /></>,
  mic: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0m-7 7v3m-4 0h8" /></>,
  swap: <><path d="m16 3 4 4-4 4M4 7h16M8 21l-4-4 4-4m12 4H4" /></>,
  volume: <><path d="M11 5 6 9H3v6h3l5 4V5Zm4 4a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  chevron: <path d="m7 10 5 5 5-5" />,
}

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icons[name]}
    </svg>
  )
}

const navigation: { id: Page; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'tutor', label: 'AI tutor', icon: 'sparkles' },
  { id: 'translate', label: 'Translator', icon: 'translate' },
  { id: 'vocabulary', label: 'Vocabulary', icon: 'book' },
  { id: 'progress', label: 'My progress', icon: 'chart' },
]

const languages = [
  { code: 'en', name: 'English', flag: '🇬🇧', locale: 'en-GB' },
  { code: 'zh', name: 'Mandarin Chinese', flag: '🇨🇳', locale: 'zh-CN' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸', locale: 'es-ES' },
  { code: 'fr', name: 'French', flag: '🇫🇷', locale: 'fr-FR' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵', locale: 'ja-JP' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷', locale: 'ko-KR' },
  { code: 'de', name: 'German', flag: '🇩🇪', locale: 'de-DE' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦', locale: 'ar-SA' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹', locale: 'pt-PT' },
]

const samples: Record<string, string> = {
  'hello|zh': '你好！',
  'good morning|zh': '早上好！',
  'thank you|zh': '谢谢！',
  'where is the station?|zh': '车站在哪里？',
  'hello|es': '¡Hola!',
  'good morning|es': '¡Buenos días!',
  'thank you|es': '¡Gracias!',
  'where is the station?|es': '¿Dónde está la estación?',
  'hello|fr': 'Bonjour !',
  'good morning|fr': 'Bonjour !',
  'thank you|fr': 'Merci !',
  'where is the station?|fr': 'Où est la gare ?',
  'hello|ja': 'こんにちは！',
  'good morning|ja': 'おはようございます！',
  'thank you|ja': 'ありがとうございます！',
  'where is the station?|ja': '駅はどこですか？',
}

const vocabulary = [
  { word: '你好', roman: 'nǐ hǎo', meaning: 'Hello', tag: 'Greetings', color: 'peach' },
  { word: '谢谢', roman: 'xiè xie', meaning: 'Thank you', tag: 'Everyday', color: 'lavender' },
  { word: '请', roman: 'qǐng', meaning: 'Please', tag: 'Everyday', color: 'mint' },
  { word: '再见', roman: 'zài jiàn', meaning: 'Goodbye', tag: 'Greetings', color: 'blue' },
]

function App() {
  const canOpenLessonPreview = import.meta.env.DEV && lessonPreview.reviewed === false
  const [page, setPage] = useState<Page>('home')
  const [sourceCode, setSourceCode] = useState('en')
  const [targetCode, setTargetCode] = useState('zh')
  const [phrase, setPhrase] = useState('')
  const [translation, setTranslation] = useState('')
  const [translationMessage, setTranslationMessage] = useState('')
  const [sessionStarted, setSessionStarted] = useState(false)

  const sourceLanguage = languages.find((language) => language.code === sourceCode) ?? languages[0]
  const targetLanguage = languages.find((language) => language.code === targetCode) ?? languages[1]
  const pageTitle = navigation.find((item) => item.id === page)?.label ?? 'Settings'

  function translatePhrase() {
    const key = `${phrase.trim().toLowerCase()}|${targetCode}`
    const result = samples[key]
    if (!phrase.trim()) {
      setTranslation('')
      setTranslationMessage('Type a phrase first to try a sample translation.')
      return
    }
    if (!result) {
      setTranslation('')
      setTranslationMessage('This prototype only includes a few sample phrases. Live translation is not connected yet.')
      return
    }
    setTranslation(result)
    setTranslationMessage('Sample translation · live translation is not connected yet')
  }

  function speakTranslation() {
    if (!translation || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(translation)
    utterance.lang = targetLanguage.locale
    window.speechSynthesis.speak(utterance)
  }

  function swapLanguages() {
    setSourceCode(targetCode)
    setTargetCode(sourceCode)
    setPhrase('')
    setTranslation('')
    setTranslationMessage('')
  }

  function tryPhrase(example: string) {
    setPhrase(example)
    const key = `${example.toLowerCase()}|${targetCode}`
    const result = samples[key]
    setTranslation(result ?? '')
    setTranslationMessage(result
      ? 'Sample translation · live translation is not connected yet'
      : 'This example is available for selected sample languages only.')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setPage('home')} aria-label="Go to home">
          <span className="brand-mark"><Icon name="sparkles" size={21} /></span>
          <span>mori<span className="brand-period">.</span></span>
        </button>

        <div className="sidebar-label">YOUR SPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              key={item.id}
              onClick={() => setPage(item.id)}
              aria-current={page === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
              {item.id === 'tutor' && <span className="nav-new">NEW</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="plan-card">
            <div className="plan-icon"><Icon name="sparkles" size={18} /></div>
            <p className="plan-title">Small steps, big fluency.</p>
            <p className="plan-copy">A little practice every day adds up.</p>
            <div className="plan-progress"><span /></div>
            <div className="plan-foot"><span>Weekly goal</span><strong>3 of 5 days</strong></div>
          </div>
          <button className={`nav-item settings-link ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}>
            <Icon name="settings" size={19} /><span>Settings</span>
          </button>
          <div className="profile-row">
            <div className="avatar">J</div>
            <div className="profile-copy"><strong>Jamie Chen</strong><span>Beginner · A1</span></div>
            <button className="icon-button profile-menu" aria-label="Profile options"><Icon name="chevron" size={17} /></button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Your space <span>/</span> <strong>{pageTitle}</strong></div>
          <div className="topbar-actions">
            <button className="streak-pill" aria-label="Your 4 day streak"><span>✦</span> 4 day streak</button>
            <button className="avatar avatar-small" onClick={() => setPage('settings')} aria-label="Open settings">J</button>
          </div>
        </header>

        {page === 'home' && (
          <div className="page-content">
            <section className="welcome-row">
              <div>
                <p className="eyebrow">SUNDAY, OCTOBER 11 · SAMPLE DASHBOARD</p>
                <h1>A little progress,<br className="mobile-break" /> every day <span className="heading-sparkle">✳</span></h1>
                <p className="welcome-copy">You're building a lovely habit. Ready for today's practice?</p>
              </div>
              <div className="week-streak" aria-label="Weekly learning streak">
                <span className="streak-caption">YOUR WEEK</span>
                <div className="streak-days">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
                    <div className="streak-day" key={`${day}-${index}`}>
                      <span className={index < 4 ? 'day-dot completed' : index === 4 ? 'day-dot today' : 'day-dot'}>{index < 4 ? '✓' : ''}</span>
                      <span>{day}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="learning-card">
              <div className="learning-copy">
                <div className="lesson-kicker"><span className="lesson-dot" /> YOUR NEXT LESSON <span className="lesson-time"><Icon name="clock" size={14} /> 10 MIN</span></div>
                <h2>Your next text lesson</h2>
                <p>Practise a few Mandarin greetings in a short, guided lesson with Ira.</p>
                <div className="lesson-meta"><span className="language-chip"><span>🇨🇳</span> Mandarin</span><span className="level-chip">BEGINNER · A1</span></div>
                {canOpenLessonPreview && <button className="button button-dark" onClick={() => setPage('lesson')}>
                  Open text lesson <Icon name="arrow" size={17} />
                </button>}
                <button className="lesson-voice-link" onClick={() => { setPage('tutor'); setSessionStarted(true) }}>
                  Prefer a conversation? Talk with Ira <Icon name="arrow" size={15} />
                </button>
              </div>
              <div className="lesson-art" aria-hidden="true">
                <div className="sun-shape" />
                <div className="art-card art-card-back" />
                <div className="art-card art-card-front">
                  <div className="tea-cup"><div className="tea" /><div className="cup-handle" /></div>
                  <div className="art-lines"><span /><span /></div>
                </div>
                <div className="art-sparkle sparkle-one">✳</div><div className="art-sparkle sparkle-two">✦</div>
                <div className="art-leaf">⌁</div>
              </div>
            </section>

            <section className="stats-grid" aria-label="Learning overview">
              <article className="stat-card stat-highlight">
                <div className="stat-icon stat-icon-peach"><Icon name="clock" size={18} /></div>
                <span className="stat-label">TIME THIS WEEK</span>
                <strong>42 <small>min</small></strong>
                <span className="stat-note"><span className="positive">↗ 12%</span> from last week</span>
              </article>
              <article className="stat-card">
                <div className="stat-icon stat-icon-lavender"><Icon name="book" size={18} /></div>
                <span className="stat-label">WORDS LEARNED</span>
                <strong>128</strong>
                <span className="stat-note">You're on a roll ✨</span>
              </article>
              <article className="stat-card">
                <div className="stat-icon stat-icon-mint"><Icon name="chart" size={18} /></div>
                <span className="stat-label">DAY STREAK</span>
                <strong>4 <small>days</small></strong>
                <span className="stat-note">Your best is 9 days</span>
              </article>
              <button className="stat-card stat-link-card" onClick={() => setPage('progress')}>
                <div className="stat-icon stat-icon-blue"><Icon name="sparkles" size={18} /></div>
                <span className="stat-label">YOUR LEVEL</span>
                <strong>A1 <small>Beginner</small></strong>
                <span className="stat-note">See your progress <Icon name="arrow" size={14} /></span>
              </button>
            </section>

            <section className="lower-grid">
              <div className="panel practice-panel">
                <div className="section-heading"><div><p className="eyebrow">PICK UP WHERE YOU LEFT OFF</p><h3>Make it a moment</h3></div><button className="text-button" onClick={() => setPage('tutor')}>See all <Icon name="arrow" size={15} /></button></div>
                <div className="practice-options">
                  <button className="practice-option" onClick={() => { setPage('tutor'); setSessionStarted(true) }}>
                    <span className="practice-icon practice-chat"><Icon name="sparkles" size={19} /></span><span className="practice-label"><strong>Chat with your tutor</strong><small>A friendly conversation, just for you</small></span><Icon name="arrow" size={17} />
                  </button>
                  <button className="practice-option" onClick={() => setPage('translate')}>
                    <span className="practice-icon practice-translate"><Icon name="translate" size={19} /></span><span className="practice-label"><strong>Try a translation</strong><small>Find the words for what you mean</small></span><Icon name="arrow" size={17} />
                  </button>
                  <button className="practice-option" onClick={() => setPage('vocabulary')}>
                    <span className="practice-icon practice-review"><Icon name="book" size={19} /></span><span className="practice-label"><strong>Review your words</strong><small>4 words are ready to revisit</small></span><Icon name="arrow" size={17} />
                  </button>
                </div>
              </div>
              <div className="panel words-panel">
                <div className="section-heading"><div><p className="eyebrow">A FEW GOOD WORDS</p><h3>Recently learned</h3></div><button className="text-button" onClick={() => setPage('vocabulary')}>View all <Icon name="arrow" size={15} /></button></div>
                <div className="word-list">
                  {vocabulary.slice(0, 3).map((item) => <div className="word-row" key={item.word}><span className={`word-badge ${item.color}`}>{item.word}</span><span className="word-detail"><strong>{item.meaning}</strong><small>{item.roman}</small></span><button className="icon-button word-play" onClick={() => speakWord(item.word)} aria-label={`Play pronunciation for ${item.meaning}`}><Icon name="volume" size={17} /></button></div>)}
                </div>
              </div>
            </section>
            <footer className="page-footer"><span>A calm little corner for your language journey.</span><span>Made for curious minds <span className="footer-heart">♥</span></span></footer>
          </div>
        )}

        {page === 'lesson' && canOpenLessonPreview && <LessonPlayer onExit={() => setPage('home')} />}

        {page === 'translate' && (
          <div className="page-content subpage-content">
            <div className="subpage-intro"><p className="eyebrow">A LITTLE HELP WITH THE WORDS</p><h1>Say it your way.</h1><p>Find the right words, one phrase at a time.</p></div>
            <section className="translator-card">
              <div className="language-selectors">
                <label className="language-select"><span>FROM</span><span className="language-select-control"><span>{sourceLanguage.flag}</span><select aria-label="Translate from" value={sourceCode} onChange={(event) => setSourceCode(event.target.value)}>{languages.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}</select><Icon name="chevron" size={16} /></span></label>
                <button className="swap-button" onClick={swapLanguages} aria-label="Swap languages"><Icon name="swap" size={19} /></button>
                <label className="language-select"><span>TO</span><span className="language-select-control"><span>{targetLanguage.flag}</span><select aria-label="Translate to" value={targetCode} onChange={(event) => { setTargetCode(event.target.value); setTranslation(''); setTranslationMessage('') }}>{languages.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}</select><Icon name="chevron" size={16} /></span></label>
              </div>
              <div className="translation-workspace">
                <div className="translation-side">
                  <div className="translation-side-label">{sourceLanguage.name} <span>Original</span></div>
                  <textarea value={phrase} onChange={(event) => { setPhrase(event.target.value); setTranslation(''); setTranslationMessage('') }} placeholder="Type a word or phrase…" aria-label="Text to translate" maxLength={300} />
                  <div className="translation-controls"><button className="icon-button mic-button" aria-label="Voice input is not available in this preview" title="Voice input is not connected yet"><Icon name="mic" size={18} /></button><span>{phrase.length}/300</span></div>
                </div>
                <div className="translation-side translation-result">
                  <div className="translation-side-label">{targetLanguage.name} <span>Translation</span></div>
                  {translation ? <p className="translated-text" lang={targetLanguage.locale}>{translation}</p> : <p className="translation-placeholder">Your translation will appear here.</p>}
                  {translation && <button className="icon-button result-audio" onClick={speakTranslation} aria-label="Speak translation"><Icon name="volume" size={18} /></button>}
                  <div className="translation-controls"><span>{translation ? 'Sample phrase' : ' '}</span><span /></div>
                </div>
              </div>
              <div className="translate-submit-row"><div className="demo-disclaimer"><span className="info-dot">i</span><span>{translationMessage || 'Preview mode · a few sample phrases are available'}</span></div><button className="button button-dark translate-button" onClick={translatePhrase}>Translate <Icon name="arrow" size={17} /></button></div>
            </section>
            <section className="examples-section"><div className="section-heading"><div><p className="eyebrow">NEED A PLACE TO START?</p><h3>Try a little phrase</h3></div></div><div className="example-list">{['Hello', 'Good morning', 'Thank you', 'Where is the station?'].map((example) => <button className="example-chip" key={example} onClick={() => tryPhrase(example)}>{example}<Icon name="arrow" size={14} /></button>)}</div></section>
            <div className="prototype-note"><Icon name="sparkles" size={17} /><span>This is an early preview. Voice input and live AI translation will be added in a later step.</span></div>
          </div>
        )}

        {page === 'tutor' && (
          <div className="page-content subpage-content">
            <div className="subpage-intro"><p className="eyebrow">YOUR PATIENT PRACTICE PARTNER</p><h1>Let's find your words.</h1><p>A gentle place to practise without pressure.</p></div>
            <div className="tutor-layout">
              <section className="tutor-card">
                <div className="tutor-topline"><span className="tutor-avatar"><Icon name="sparkles" size={22} /></span><span><strong>Mori</strong><small>Your Mandarin practice partner</small></span><span className="online-dot">Here to help</span></div>
                <div className="tutor-chat"><div className="chat-bubble tutor-bubble"><span className="chat-name">MORI · MANDARIN</span><p>你好，Jamie! 今天想喝什么？</p><small>Nǐ hǎo, Jamie! What would you like to drink today?</small><button className="icon-button chat-audio" onClick={() => speakWord('你好，Jamie! 今天想喝什么？')} aria-label="Hear Mori speak"><Icon name="volume" size={16} /></button></div>{sessionStarted && <div className="chat-bubble user-bubble">我想喝咖啡。<small>Wǒ xiǎng hē kāfēi. · I would like coffee.</small></div>}</div>
                <div className="tutor-composer"><input aria-label="Your response" placeholder="Write a reply in Mandarin…" /><button className="icon-button composer-mic" aria-label="Voice input is not available in this preview" title="Voice input is not connected yet"><Icon name="mic" size={19} /></button><button className="send-button" aria-label="Send message" onClick={() => setSessionStarted(true)}><Icon name="arrow" size={18} /></button></div><p className="tutor-preview-note">Preview conversation · AI tutor replies are not connected yet</p>
              </section>
              <aside className="tutor-side-card"><span className="side-card-icon"><Icon name="sparkles" size={20} /></span><p className="eyebrow">TODAY'S LITTLE GOAL</p><h3>Order something delicious</h3><p>Try asking for a drink in Mandarin. Mistakes are welcome here.</p><div className="goal-check"><span><Icon name="check" size={14} /></span> Say what you'd like to drink</div><div className="goal-check"><span className="empty-check" /> Add a polite “please”</div></aside>
            </div>
          </div>
        )}

        {page === 'vocabulary' && (
          <div className="page-content subpage-content">
            <div className="subpage-intro"><p className="eyebrow">WORDS TO TAKE WITH YOU</p><h1>Your little word garden.</h1><p>Every new word is another way to connect.</p></div>
            <section className="vocabulary-card"><div className="vocab-toolbar"><div className="vocab-count"><strong>128</strong><span>words learned</span></div><button className="button button-outline" onClick={() => setTranslationMessage('Saving new words will be available when your account is connected.')}><Icon name="plus" size={17} /> Add a word</button></div><div className="vocab-table-heading"><span>WORD</span><span>MEANING</span><span>COLLECTION</span><span /></div>{vocabulary.map((item) => <div className="vocab-row" key={item.word}><div className="vocab-word"><span className={`word-badge ${item.color}`}>{item.word}</span><span>{item.roman}</span></div><strong>{item.meaning}</strong><span className="tag">{item.tag}</span><button className="icon-button" aria-label={`Hear ${item.word}`} onClick={() => speakWord(item.word)}><Icon name="volume" size={17} /></button></div>)}{translationMessage && <p className="inline-notice">{translationMessage}</p>}</section>
          </div>
        )}

        {page === 'progress' && (
          <div className="page-content subpage-content">
            <div className="subpage-intro"><p className="eyebrow">LOOK HOW FAR YOU'VE COME</p><h1>Little steps count.</h1><p>Your learning journey, at a glance.</p></div>
            <section className="progress-summary"><article className="progress-stat"><span className="stat-icon stat-icon-peach"><Icon name="clock" size={18} /></span><span className="stat-label">TOTAL PRACTICE</span><strong>6.5 <small>hours</small></strong><span className="stat-note">Since you began</span></article><article className="progress-stat"><span className="stat-icon stat-icon-lavender"><Icon name="book" size={18} /></span><span className="stat-label">WORDS LEARNED</span><strong>128</strong><span className="stat-note">Across 12 topics</span></article><article className="progress-stat"><span className="stat-icon stat-icon-mint"><Icon name="chart" size={18} /></span><span className="stat-label">CURRENT STREAK</span><strong>4 <small>days</small></strong><span className="stat-note">Your best is 9 days</span></article></section>
            <section className="panel progress-panel"><div className="section-heading"><div><p className="eyebrow">A STEADY RHYTHM</p><h3>Your weekly practice</h3></div><span className="level-chip">THIS WEEK</span></div><div className="bar-chart">{[['M', 68], ['T', 42], ['W', 84], ['T', 56], ['F', 26], ['S', 0], ['S', 0]].map(([day, value], index) => <div className="chart-column" key={`${day}-${index}`}><div className="chart-track"><span className={index < 4 ? 'chart-fill' : 'chart-fill future'} style={{ height: `${value}%` }} /></div><span>{day}</span></div>)}</div><div className="chart-foot"><span>Goal: 15 minutes a day</span><strong>42 / 75 min</strong></div></section>
          </div>
        )}

        {page === 'settings' && (
          <div className="page-content subpage-content">
            <div className="subpage-intro"><p className="eyebrow">MAKE THIS SPACE YOURS</p><h1>Your settings.</h1><p>A few ways to make learning feel like you.</p></div>
            <section className="settings-card"><div className="setting-row"><span><strong>I'm learning</strong><small>Choose the language you want to practise</small></span><label className="settings-select"><select aria-label="Language you are learning" value={targetCode} onChange={(event) => setTargetCode(event.target.value)}>{languages.map((language) => <option key={language.code} value={language.code}>{language.flag} {language.name}</option>)}</select><Icon name="chevron" size={16} /></label></div><div className="setting-row"><span><strong>My level</strong><small>We’ll find the right pace for you</small></span><span className="level-chip">BEGINNER · A1</span></div><div className="setting-row"><span><strong>Daily reminder</strong><small>A gentle nudge to practise each day</small></span><span className="toggle-on" aria-label="Daily reminder on"><span /></span></div><div className="setting-row"><span><strong>Privacy</strong><small>Your practice stays yours. Audio is not saved in this preview.</small></span><span className="privacy-pill">On your device</span></div></section>
          </div>
        )}
      </main>
    </div>
  )
}

function speakWord(word: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(word)
  utterance.lang = 'zh-CN'
  window.speechSynthesis.speak(utterance)
}

export default App
