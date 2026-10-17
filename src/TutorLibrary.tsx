import { useMemo, useState } from 'react'
import type { RoleplayScenario } from './roleplay-scenarios.js'
import { ROLEPLAY_SCENARIOS } from './roleplay-scenarios.js'
import './TutorLibrary.css'

export type LibraryRoleplay = RoleplayScenario & { section: string }

type Props = {
  initialKind?: 'lessons' | 'roleplays' | 'free-chat'
  onKindChange?: (kind: 'lessons' | 'roleplays' | 'free-chat') => void
  onStartLesson: (title: string, section: string) => void
  onStartRoleplay: (scenario: LibraryRoleplay, section: string) => void
  onStartFreeChat: (topic?: string, durationMinutes?: number) => void
}

type LibraryCard = { title: string; category: string; icon: string; level: string; copy: string }
const categories = ['All', 'Beginner', 'Life', 'Food', 'Travel', 'Shopping', 'Grammar', 'Social', 'Culture', 'Romance', 'Health', 'Education', 'Work', 'Entertainment', 'Persuade', 'Debates']
const lessons: LibraryCard[] = [
  { title: 'Order your first coffee', category: 'Food', icon: '☕', level: 'A1', copy: 'Order a drink and make it your way.' },
  { title: 'Meet the family', category: 'Life', icon: '🏡', level: 'A1', copy: 'Talk about the people close to you.' },
  { title: 'Counting and numbers', category: 'Beginner', icon: '🔢', level: 'A1', copy: 'Use numbers in everyday conversations.' },
  { title: 'Money and prices', category: 'Shopping', icon: '🪙', level: 'A1', copy: 'Ask how much something costs.' },
  { title: 'Prepositions of place', category: 'Grammar', icon: '📍', level: 'A2', copy: 'Say where things are.' },
  { title: 'Past and future tense', category: 'Grammar', icon: '⏳', level: 'A2', copy: 'Share what happened and what is next.' },
  { title: 'Festivals and holidays', category: 'Culture', icon: '🎉', level: 'A2', copy: 'Describe a celebration you enjoy.' },
  { title: 'Dating etiquette', category: 'Romance', icon: '💬', level: 'B1', copy: 'Make plans and get to know someone.' },
  { title: 'At the pharmacy', category: 'Health', icon: '🌿', level: 'A2', copy: 'Explain a simple need and ask for help.' },
  { title: 'First day of class', category: 'Education', icon: '📚', level: 'A1', copy: 'Meet classmates and ask questions.' },
  { title: 'A productive work meeting', category: 'Work', icon: '🗂️', level: 'B1', copy: 'Share an idea and follow up.' },
  { title: 'Recommend a film', category: 'Entertainment', icon: '🎬', level: 'A2', copy: 'Talk about stories you love.' },
  { title: 'A weekend away', category: 'Travel', icon: '🧳', level: 'A1', copy: 'Plan a simple trip together.' },
  { title: 'Convince me to try it', category: 'Persuade', icon: '✨', level: 'B2', copy: 'Make a friendly, convincing case.' },
  { title: 'Is remote work better?', category: 'Debates', icon: '⚖️', level: 'B2', copy: 'Share a view and respond thoughtfully.' },
  { title: 'Small talk at a party', category: 'Social', icon: '🎈', level: 'A2', copy: 'Start a conversation and keep it going.' },
]

const extraRoleplays: Array<{ title: string; category: string; icon: string; goal: string }> = [
  { title: 'Taxi ride', category: 'Travel', icon: '🚕', goal: 'Tell the driver where you are going and ask a quick question.' },
  { title: 'Buying train tickets', category: 'Travel', icon: '🚆', goal: 'Ask for a ticket and confirm the departure time.' },
  { title: 'Lost wallet', category: 'Life', icon: '👛', goal: 'Explain what is missing and ask someone for help.' },
  { title: 'First day of class', category: 'Education', icon: '🎒', goal: 'Introduce yourself and ask a classmate about the course.' },
  { title: 'Meet a celebrity', category: 'Entertainment', icon: '🌟', goal: 'Start a respectful conversation and ask one thoughtful question.' },
  { title: 'A supportive conversation', category: 'Health', icon: '🫶', goal: 'Listen, respond kindly, and express how you feel.' },
  { title: 'Visiting your partner’s family', category: 'Life', icon: '🍲', goal: 'Greet the family and join a meal conversation.' },
  { title: 'Cooking together', category: 'Food', icon: '🥘', goal: 'Choose ingredients and explain the next cooking step.' },
  { title: 'Four-day workweek', category: 'Debates', icon: '🗓️', goal: 'Give reasons for and against a shorter workweek.' },
  { title: 'Climate change', category: 'Debates', icon: '🌍', goal: 'Discuss one practical response to climate change.' },
  { title: 'An AI dilemma', category: 'Debates', icon: '🤖', goal: 'Compare benefits and concerns about a new technology.' },
  { title: 'Persuade a friend to visit', category: 'Persuade', icon: '🧭', goal: 'Make a friendly case for a place you enjoy.' },
  { title: 'Plan a first date', category: 'Romance', icon: '🌷', goal: 'Suggest a relaxed plan and learn what the other person enjoys.' },
]

function scenarioFromCard(title: string, goal: string, id: string): LibraryRoleplay {
  const existing = ROLEPLAY_SCENARIOS.find((scenario) => scenario.title.toLowerCase() === title.toLowerCase())
  if (existing) return { ...existing, section: id.split(':')[0] || 'Social' }
  return {
    id,
    level: 'A1',
    title,
    goal,
    successCriteria: ['Use a greeting or opener', 'Ask and answer a follow-up question'],
    usefulPhrases: [],
    openingLine: '',
    openingMeaning: '',
    vocabulary: '',
    grammarPoint: '',
    section: id.split(':')[0] || 'Social',
  }
}

export default function TutorLibrary({ initialKind = 'lessons', onKindChange, onStartLesson, onStartRoleplay, onStartFreeChat }: Props) {
  const [kind, setKind] = useState<'lessons' | 'roleplays' | 'free-chat'>(initialKind)
  const [category, setCategory] = useState('All')
  const [customTitle, setCustomTitle] = useState('')
  const [customError, setCustomError] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(10)

  const cards = useMemo(() => {
    const source = kind === 'lessons'
      ? lessons
      : kind === 'roleplays'
        ? [
        ...ROLEPLAY_SCENARIOS.map((scenario) => ({ title: scenario.title, category: 'Social', icon: '🗣️', level: scenario.level, copy: scenario.goal })),
        ...extraRoleplays.map((item) => ({ ...item, level: 'A1', copy: item.goal })),
          ]
        : []
    return source.filter((item) => (
      category === 'All' || (category === 'Beginner' ? item.level === 'A1' : item.category === category)
    ))
  }, [category, kind])

  function startCustom() {
    const title = customTitle.trim()
    if (!title) {
      if (kind === 'free-chat') {
        onStartFreeChat(undefined, durationMinutes)
        return
      }
      setCustomError(`Enter a topic for your custom ${kind === 'lessons' ? 'lesson' : 'roleplay'}.`)
      return
    }
    setCustomError('')
    if (kind === 'lessons') onStartLesson(title, 'Beginner')
    else if (kind === 'roleplays') onStartRoleplay(scenarioFromCard(title, `Practise a natural conversation about ${title}.`, `Social:custom-${Date.now()}`), 'Social')
    else onStartFreeChat(title, durationMinutes)
  }

  return (
    <div className="page-content tutor-library-page">
      <div className="library-heading">
        <p className="eyebrow">YOUR NEXT CONVERSATION</p>
        <h1>{kind === 'free-chat' ? 'Free chat' : `Pick a ${kind === 'lessons' ? 'lesson' : 'roleplay'}`}</h1>
        <p>Choose a prompt and your tutor will shape the conversation to your level.</p>
      </div>
      <div className="library-segment" role="group" aria-label="Choose practice type">
        <button type="button" className={kind === 'lessons' ? 'is-selected' : ''} aria-pressed={kind === 'lessons'} onClick={() => { setKind('lessons'); setCategory('All'); onKindChange?.('lessons') }}>Lessons</button>
        <button type="button" className={kind === 'roleplays' ? 'is-selected' : ''} aria-pressed={kind === 'roleplays'} onClick={() => { setKind('roleplays'); setCategory('All'); onKindChange?.('roleplays') }}>Roleplays</button>
        <button type="button" className={kind === 'free-chat' ? 'is-selected' : ''} aria-pressed={kind === 'free-chat'} onClick={() => { setKind('free-chat'); setCategory('All'); onKindChange?.('free-chat') }}>Free Chat</button>
      </div>
      {kind === 'free-chat' ? (
        <section className="library-custom-card free-chat-library-card">
          <div><span>✦</span><strong>Talk about what interests you</strong><small>Your tutor leads with a target-language example, then adapts to your hobbies, goals, and level.</small></div>
          <div className="library-custom-form"><input value={customTitle} maxLength={100} onChange={(event) => { setCustomTitle(event.target.value); setCustomError('') }} onKeyDown={(event) => { if (event.key === 'Enter') startCustom() }} placeholder="Optional topic, e.g. music or travel" aria-label="Optional free chat topic" /><button type="button" onClick={() => onStartFreeChat(customTitle.trim() || undefined, durationMinutes)}>Start free chat ›</button></div>
            <fieldset className="free-chat-duration"><legend>How long would you like to practise?</legend>{[5, 10, 15, 20].map((minutes) => <button key={minutes} type="button" aria-pressed={durationMinutes === minutes} className={durationMinutes === minutes ? 'is-selected' : ''} onClick={() => setDurationMinutes(minutes)}>{minutes} min</button>)}</fieldset>
            {customError && <p role="alert">{customError}</p>}
        </section>
      ) : <section className="library-custom-card">
        <div><span>✦</span><strong>Make it personal</strong><small>Ask your tutor to build a {kind === 'lessons' ? 'lesson' : 'roleplay'} around any topic.</small></div>
        <div className="library-custom-form"><input value={customTitle} maxLength={100} onChange={(event) => { setCustomTitle(event.target.value); setCustomError('') }} onKeyDown={(event) => { if (event.key === 'Enter') startCustom() }} placeholder={kind === 'lessons' ? 'e.g. Talking about my garden' : 'e.g. At a neighborhood market'} aria-label={`Custom ${kind === 'lessons' ? 'lesson' : 'roleplay'} topic`} /><button type="button" onClick={startCustom}>Start ›</button></div>
        {customError && <p role="alert">{customError}</p>}
      </section>}
      {kind !== 'free-chat' && <div className="library-category-tabs" role="tablist" aria-label="Filter by category">
        {categories.map((item) => <button key={item} role="tab" aria-selected={category === item} className={category === item ? 'is-selected' : ''} onClick={() => setCategory(item)}>{item}</button>)}
      </div>}
      <section className="library-card-grid" aria-label={`${kind} to practise`}>
        {cards.map((card) => {
          const scenario = kind === 'roleplays' ? scenarioFromCard(card.title, card.copy, `${card.category}:${card.title.toLowerCase().replaceAll(' ', '-')}`) : null
          return <button key={`${kind}-${card.title}`} className="library-topic-card" type="button" onClick={() => scenario ? onStartRoleplay(scenario, card.category) : onStartLesson(card.title, card.category)}><span className="library-card-icon">{card.icon}</span><span className="library-card-level">{card.level} · {card.category}</span><strong>{card.title}</strong><small>{card.copy}</small><span className="library-card-arrow">Start ›</span></button>
        })}
      </section>
      {cards.length === 0 && kind !== 'free-chat' && <p className="library-empty">More {kind} for {category.toLowerCase()} are coming soon.</p>}
    </div>
  )
}
