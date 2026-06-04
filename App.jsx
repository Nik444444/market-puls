import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './styles.css'

const LS = { groq:'md_groq_key', finnhub:'md_finnhub_key', model:'md_model', autoAi:'md_auto_ai' }
const DEFAULT_KEYS = {
  groq: import.meta.env.VITE_GROQ_API_KEY || '',
  finnhub: import.meta.env.VITE_FINNHUB_API_KEY || '',
  model: import.meta.env.VITE_GROQ_MODEL || 'llama-3.3-70b-versatile'
}

const ASSETS = [
  { id:'ALL', label:'MARKET', name:'Глобальный рынок', emoji:'🌐', icon:'◇', className:'market', queries:['forex','federal reserve','ecb','inflation','jobs','dollar','gold','treasury','risk','oil','iran'] },
  { id:'EURUSD', label:'EUR/USD', name:'Евро против доллара', emoji:'🇪🇺', icon:'€', className:'eur', queries:['euro','ecb','eurusd','eurozone','dollar','lagarde','germany','italy','france'] },
  { id:'GBPUSD', label:'GBP/USD', name:'Фунт против доллара', emoji:'🇬🇧', icon:'£', className:'gbp', queries:['pound','boe','gbpusd','uk inflation','dollar','bailey','sterling'] },
  { id:'XAUUSD', label:'XAU/USD', name:'Золото', emoji:'🥇', icon:'Au', className:'gold', queries:['gold','xau','treasury yields','real yields','dollar','safe haven','war','iran','oil'] },
  { id:'NASDAQ', label:'NASDAQ', name:'Tech / risk-on', emoji:'🟦', icon:'NQ', className:'nasdaq', queries:['nasdaq','technology','ai stocks','nvidia','fed','yields','risk sentiment','stocks'] },
  { id:'SP500', label:'S&P 500', name:'Широкий рынок США', emoji:'🇺🇸', icon:'SP', className:'spx', queries:['sp500','s&p','stocks','risk sentiment','fed','yields','earnings','inflation'] },
  { id:'GER40', label:'GER40', name:'DAX / Европа', emoji:'🇩🇪', icon:'DAX', className:'dax', queries:['dax','germany','eurozone','ecb','european stocks','german inflation','bund'] },
]

// Sessions in Berlin time (CEST = UTC+2)
const SESSIONS = [
  { id:'asia',   label:'ASIA',    start:1,  end:10,  color:'#38d7c6', dim:'rgba(56,215,198,.12)' },
  { id:'frankfurt', label:'FRANKFURT', start:8, end:10, color:'#f6b44b', dim:'rgba(246,180,75,.12)' },
  { id:'london', label:'LONDON',  start:9,  end:17, color:'#9b5cff', dim:'rgba(155,92,255,.12)' },
  { id:'ny',     label:'NEW YORK',start:15, end:23, color:'#ff4d6d', dim:'rgba(255,77,109,.12)' },
]
const KILL_ZONES = [
  { id:'london_kz', label:'London KZ',   start:9,   end:11,  color:'#9b5cff' },
  { id:'ny_silver',  label:'NY Silver Bullet', start:16, end:17, color:'#ff4d6d' },
  { id:'ny_kz',      label:'NY Kill Zone',  start:15.5, end:16, color:'#ff9f4a' },
]

const nowIsoDate = (offset=0)=>{ const d=new Date(); d.setDate(d.getDate()+offset); return d.toISOString().slice(0,10) }
const timeFmt = d => new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Berlin'}).format(new Date(d))
const safeJson = txt => { try { return JSON.parse(txt) } catch { const a=txt.indexOf('{'), b=txt.lastIndexOf('}'); if(a>=0&&b>a){ try{return JSON.parse(txt.slice(a,b+1))}catch{}} return null } }
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n))

const stripHtml = (v='') => String(v)
  .replace(/<style[\s\S]*?<\/style>/gi,' ')
  .replace(/<script[\s\S]*?<\/script>/gi,' ')
  .replace(/<[^>]+>/g,' ')
  .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim()
const shortText = (v='', n=220) => { const t=stripHtml(v); return t.length>n ? t.slice(0,n).trim()+'…' : t }

const newsImpact = (n) => {
  const t=(`${n.headline||''} ${n.summary||''}`).toLowerCase()
  if(/cpi|pce|inflation|fed|fomc|powell|ecb|rate|yields|payroll|nfp|gdp|war|iran|oil|sanction/.test(t)) return 'HIGH'
  if(/dollar|gold|stocks|nasdaq|sp500|euro|pound|treasury|confidence|pmi|retail/.test(t)) return 'MEDIUM'
  return 'LOW'
}

const ruTake = (n) => {
  const t=(`${n.headline||''} ${n.summary||''}`).toLowerCase()
  if(/inflation|cpi|pce|ppi/.test(t)) return '📌 Инфляция: сравни факт с прогнозом → USD/yields reaction первичная'
  if(/fed|fomc|powell|rate|treasury|yield/.test(t)) return '📌 Ставки: USD и yields усиливаются → давление на EUR/GBP/XAU/индексы'
  if(/ecb|lagarde|eurozone|germany|italy|france/.test(t)) return '📌 Европа/ECB: прямой драйвер EUR/USD и GER40'
  if(/boe|pound|sterling|uk/.test(t)) return '📌 UK/BoE: драйвер GBP/USD → проверь синхронизацию с EUR'
  if(/gold|xau|safe haven|iran|war|geopolitical|oil/.test(t)) return '📌 Risk event: следи за XAU и нефтью → risk-off или разворот'
  if(/nasdaq|sp500|stocks|earnings|ai|nvidia/.test(t)) return '📌 Индексы: risk sentiment → торговать после реакции USD/yields'
  return '📌 Макро: ждать реакции рынка и подтверждения направления'
}

function demoNews(){return [
  {id:'n1', datetime:Date.now()/1000, source:'Macro Desk', headline:'Dollar holds firm before US inflation data as yields stay elevated', summary:'Markets wait for CPI and Fed speakers. EUR/USD remains sensitive to dollar repricing.'},
  {id:'n2', datetime:Date.now()/1000-1800, source:'Macro Desk', headline:'Gold consolidates as traders watch real yields and risk sentiment', summary:'XAU/USD may stay bid if yields fall or risk-off flow returns.'},
  {id:'n3', datetime:Date.now()/1000-3600, source:'Macro Desk', headline:'European currencies trade cautiously before ECB commentary', summary:'EUR and GBP need clean catalyst; range conditions remain possible until US session.'},
  {id:'n4', datetime:Date.now()/1000-5400, source:'Macro Desk', headline:'US equity futures mixed ahead of key macro calendar', summary:'Indices are vulnerable to high-impact data and Fed repricing.'},
  {id:'n5', datetime:Date.now()/1000-7200, source:'Macro Desk', headline:'Fed speakers signal higher-for-longer stance amid sticky inflation', summary:'Multiple FOMC members reiterated patience before rate cuts. USD supported on dips.'},
  {id:'n6', datetime:Date.now()/1000-9000, source:'Macro Desk', headline:'Oil edges higher on supply concerns and Middle East tensions', summary:'WTI above key level. Risk-off tone benefits gold; equity futures cautious.'},
]}
function demoCalendar(){ const today=nowIsoDate(0); return [
  {id:'c1', date:`${today} 08:00:00`, country:'EUR', event:'German CPI m/m', impact:'medium', actual:'', estimate:'0.2%', previous:'0.1%'},
  {id:'c2', date:`${today} 11:00:00`, country:'EUR', event:'ECB President Speech', impact:'high', actual:'', estimate:'', previous:''},
  {id:'c3', date:`${today} 14:30:00`, country:'USD', event:'Core PCE Price Index', impact:'high', actual:'', estimate:'0.3%', previous:'0.2%'},
  {id:'c4', date:`${today} 16:00:00`, country:'USD', event:'Consumer Confidence', impact:'medium', actual:'', estimate:'101.0', previous:'99.8'},
  {id:'c5', date:`${today} 19:00:00`, country:'USD', event:'FOMC Meeting Minutes', impact:'high', actual:'', estimate:'', previous:''},
]}

function impactOf(c){ const e=(c.event||'').toLowerCase(), im=(c.impact||'').toLowerCase(); if(im.includes('high')||/cpi|pce|nfp|payroll|rate|fed|ecb|fomc|powell|lagarde|jobs|unemployment|gdp|ism/i.test(e)) return 'high'; if(im.includes('medium')||/pmi|retail|confidence|claims|speech|ppi/i.test(e)) return 'medium'; return 'low' }
function eventMeaning(e){ const name=(e.event||'').toLowerCase(); if(/cpi|pce|ppi|inflation/.test(name)) return 'Инфляция: выше прогноза → USD/yields up, давление на gold/indices'; if(/fed|fomc|powell|rate/.test(name)) return 'Fed/ставки: hawkish/dovish repricing. Торговать после первой реакции.'; if(/ecb|lagarde/.test(name)) return 'ECB: влияет на EUR и dollar basket через EURUSD'; if(/nfp|payroll|jobs|unemployment|claims/.test(name)) return 'Труд: сильные данные = USD поддержка; слабые = риск снижения USD'; if(/pmi|ism/.test(name)) return 'PMI/ISM: growth impulse, ключ для risk-on/risk-off'; return 'Risk-событие: ждать факта, первой реакции и закрепления.' }

async function fetchFinnhubNews(key){ if(!key) return demoNews(); const cats=['forex','general']; const results=[]; for(const cat of cats){ try{ const r=await fetch(`https://finnhub.io/api/v1/news?category=${cat}&token=${key}`); const d=await r.json(); if(Array.isArray(d)) results.push(...d.slice(0,28)) }catch{} } const map=new Map(); results.forEach(n=>{ if(n.headline&&!map.has(n.headline)) map.set(n.headline,n) }); return [...map.values()].slice(0,36).map(n=>({...n, headline:shortText(n.headline,170), summary:shortText(n.summary||n.description||'',260)})) }
async function fetchFinnhubCalendar(key){ if(!key) return demoCalendar(); try{ const r=await fetch(`https://finnhub.io/api/v1/calendar/economic?from=${nowIsoDate(-1)}&to=${nowIsoDate(2)}&token=${key}`); const d=await r.json(); const arr=d.economicCalendar||d.calendar||[]; if(Array.isArray(arr)&&arr.length) return arr.slice(0,90).map((e,i)=>({id:i,date:e.time||e.date||e.datetime,country:e.country||e.region||'',event:e.event||e.name||e.indicator||'',impact:(e.impact||e.importance||'').toString().toLowerCase(),actual:e.actual,estimate:e.estimate||e.forecast,previous:e.prev||e.previous})) }catch{} return demoCalendar() }

function filterNews(news, selected){ if(selected==='ALL') return news.slice(0,18); const q=ASSETS.find(a=>a.id===selected)?.queries||[]; return news.filter(n=>q.some(w=>(`${n.headline} ${n.summary||''}`).toLowerCase().includes(w.toLowerCase()))).slice(0,18) }

// --- Sentiment Analysis ---
function calcSentiment(news) {
  const bullWords = ['rise','rally','gain','surge','strong','beat','above','higher','bullish','optimism','recovery','growth','expand','positive','improve','support']
  const bearWords = ['fall','drop','sink','decline','weak','miss','below','lower','bearish','pessimism','concern','risk','fear','downturn','shrink','negative','pressure','crisis','war','sanction','inflation']
  let bull = 0, bear = 0
  news.slice(0,20).forEach(n => {
    const t = (`${n.headline} ${n.summary||''}`).toLowerCase()
    bullWords.forEach(w => { if(t.includes(w)) bull++ })
    bearWords.forEach(w => { if(t.includes(w)) bear++ })
  })
  const total = bull + bear || 1
  const score = Math.round((bull / total) * 100)
  let label, tone
  if(score >= 65) { label = 'RISK ON'; tone = 'bull' }
  else if(score >= 45) { label = 'NEUTRAL'; tone = 'neutral' }
  else { label = 'RISK OFF'; tone = 'bear' }
  return { score, label, tone, bull, bear }
}

function localMacro(news, calendar, selected='ALL'){
  const selectedAsset = ASSETS.find(a=>a.id===selected) || ASSETS[0]
  const selectedNews = selected==='ALL' ? news : filterNews(news, selected)
  const text=[...selectedNews.map(n=>`${n.headline} ${n.summary||''}`),...calendar.map(c=>`${c.country} ${c.event}`)].join(' ').toLowerCase()
  let usd=0, risk=0, gold=0, eur=0, gbp=0
  ;['fed','rate','yield','inflation','cpi','pce','dollar','hawkish','treasury','jobs','payroll'].forEach(w=>{ if(text.includes(w)) usd+=1 })
  ;['risk','stocks','nasdaq','sp500','confidence','growth','soft landing'].forEach(w=>{ if(text.includes(w)) risk+=1 })
  ;['gold','xau','war','geopolitical','safe haven','real yields'].forEach(w=>{ if(text.includes(w)) gold+=1 })
  ;['ecb','euro','eurozone','germany','lagarde'].forEach(w=>{ if(text.includes(w)) eur+=1 })
  ;['boe','pound','uk','bailey','sterling'].forEach(w=>{ if(text.includes(w)) gbp+=1 })
  const high=calendar.filter(c=>impactOf(c)==='high').sort((a,b)=>new Date(a.date)-new Date(b.date))
  const medium=calendar.filter(c=>impactOf(c)==='medium')
  const dollarBias=usd>=3?'BULLISH':text.includes('weak dollar')?'BEARISH':'NEUTRAL'
  const macroBias=high.length?'EVENT_RISK':risk>=4&&dollarBias!=='BULLISH'?'RISK_ON':gold>=2?'RISK_OFF':'NEUTRAL'
  const confidence=clamp(54+high.length*8+usd*3+risk*2,52,88)
  const primary= selected==='ALL' ? (high[0]?.country==='USD'?'USD calendar':high[0]?.country==='EUR'?'EUR calendar':high[0]?.event||'headline flow') : selectedAsset.label
  const eurBias=dollarBias==='BULLISH'?'SHORT':eur>usd?'LONG':'WAIT'
  const gbpBias=dollarBias==='BULLISH'?'SHORT':gbp>usd?'LONG':'WAIT'
  const xauBias=dollarBias==='BULLISH'?'SHORT':gold>=2?'LONG':'WAIT'
  const idxBias=macroBias==='RISK_ON'?'LONG':macroBias==='EVENT_RISK'?'WAIT':'WAIT'
  return {
    macroBias, dollarBias, confidence, primaryAsset:primary,
    headline: high.length?`Главное сегодня: ${high[0].country} ${high[0].event} в ${timeFmt(high[0].date)}`:'Работаем от заголовков и реакции USD/yields',
    drivers:[ high.length?`⚡ High impact: ${high.length}`:'High impact нет', medium.length?`📋 Medium: ${medium.length}`:'Medium мало', dollarBias==='BULLISH'?'💵 USD под давлением':'💵 USD без преимущества', macroBias==='EVENT_RISK'?'⏸ Снижай риск до новостей':'✅ Работай от headline flow' ],
    regime:{label: macroBias==='EVENT_RISK'?'NEWS DRIVEN':macroBias==='RISK_ON'?'RISK ON':macroBias==='RISK_OFF'?'RISK OFF':'BALANCED', meaning: macroBias==='EVENT_RISK'?'Рынок может стоять до публикации и резко расшириться после факта.':'Без сильного календаря важнее реакция на заголовки и USD.'},
    assetBias:[
      {asset:'EUR/USD',bias:eurBias,reason:eurBias==='SHORT'?'USD strong narrative давит на пару.':eurBias==='LONG'?'EUR catalyst сильнее USD narrative.':'Нет чистого преимущества.',trigger:'снятие ликвидности + закрепление после USD/EUR события',risk:'возврат в диапазон после новости'},
      {asset:'GBP/USD',bias:gbpBias,reason:gbpBias==='SHORT'?'GBP уязвим при сильном USD.':gbpBias==='LONG'?'GBP получает локальный драйвер.':'Ждать синхронизации с EUR/USD.',trigger:'GBP и EUR двигаются против USD одновременно',risk:'GBP diverges from EUR'},
      {asset:'XAU/USD',bias:xauBias,reason:xauBias==='SHORT'?'Рост USD/yields обычно давит на золото.':xauBias==='LONG'?'Risk-off/safe haven поддерживает золото.':'Нужна реакция real yields.',trigger:'yields вниз или risk-off headlines',risk:'резкий рост real yields'},
      {asset:'NASDAQ',bias:idxBias,reason:idxBias==='LONG'?'Risk-on и снижение yields поддерживают tech.':'Перед macro событием лучше ждать факта.',trigger:'мягкие данные + USD/yields вниз + risk-on headlines',risk:'hawkish surprise / yields up'},
      {asset:'S&P 500',bias:idxBias,reason:idxBias==='LONG'?'Широкий risk-on поддерживает SPX.':'Без чистого macro импульса лучше ждать.',trigger:'синхронное ослабление USD/yields и рост futures',risk:'hot inflation / Fed hawkish'},
      {asset:'GER40',bias:eur>usd?'LONG':'WAIT',reason:eur>usd?'Европейский драйвер поддерживает GER40 при risk-on.':'Нужна реакция DAX на ECB/EUR данные.',trigger:'мягкий ECB/EU data + risk-on в Европе',risk:'сильный EUR давит на экспортёров / risk-off'}
    ],
    riskEvents: high.slice(0,8).map(c=>({time:timeFmt(c.date),event:c.event,impact:'HIGH',meaning:eventMeaning(c)})),
    executionPlan:{beforeNews:'До high-impact не входить в середину диапазона. Только край/ликвидность/очевидный дисбаланс.',afterNews:'После факта: 1) первый импульс, 2) sweep ближайшей ликвидности, 3) закрепление, 4) continuation через USD/DXY/yields.',avoid:'❌ Не входить за 10 мин до новости, на первой свече, при конфликте активов.'},
    ictNarrative:'Логика дня: определить главный катализатор → ждать какую сторону снимут первой. Если после новости USD закрепляется — пары против USD вниз. Если USD/yields падают — EUR/GBP/XAU шанс на long, indices risk-on. Без закрепления — шум.',
    scenarios:[
      {name:'USD Bullish Surprise',prob:dollarBias==='BULLISH'?72:54,play:'EUR/USD и GBP/USD short после sweep вверх и закрепления ниже; XAU осторожно short; indices wait/short при yields up.'},
      {name:'USD Bearish / Soft Data',prob:dollarBias==='BEARISH'?70:50,play:'EUR/USD, GBP/USD, XAU/USD long после sweep вниз и reclaim; indices long если risk-on подтверждается.'},
      {name:'Fakeout Range Day',prob:high.length?58:46,play:'Если после новости цена возвращается в диапазон — не гнаться, работать от противоположного края.'}
    ]
  }
}

async function groqAnalyze(key, model, payload){
  if(!key) throw new Error('Нет Groq key')
  const prompt=`Ты институциональный макро-аналитик и ICT intraday trader. На основе новостей и календаря дай короткий готовый dashboard для трейдера. НЕ выдумывай факты, используй только входные данные. Верни строго JSON на русском. Пиши компактно:
{"macroBias":"RISK_ON/RISK_OFF/EVENT_RISK/NEUTRAL","dollarBias":"BULLISH/BEARISH/NEUTRAL","primaryAsset":"главный драйвер","confidence":0-100,"headline":"главная идея дня","drivers":["4 коротких причины"],"regime":{"label":"NEWS DRIVEN/RISK ON/RISK OFF/BALANCED","meaning":"что это значит для трейдера"},"assetBias":[{"asset":"EUR/USD","bias":"LONG/SHORT/WAIT","reason":"почему","trigger":"условие активации сетапа","risk":"что отменяет"}],"riskEvents":[{"time":"HH:MM","event":"название","impact":"HIGH/MEDIUM/LOW","meaning":"как трактовать"}],"executionPlan":{"beforeNews":"что делать до новости","afterNews":"что делать после новости","avoid":"когда не торговать"},"scenarios":[{"name":"сценарий","prob":0-100,"play":"что делать"}],"ictNarrative":"развернутый план 6-10 строк без воды","sessionBias":{"london":"BULLISH/BEARISH/NEUTRAL + 1 предложение","newYork":"BULLISH/BEARISH/NEUTRAL + 1 предложение"},"dxyCorrNarrative":"1-2 предложения как DXY влияет на активы сегодня"}`
  const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({model:model||'llama-3.3-70b-versatile',temperature:.18,max_tokens:1000,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(payload).slice(0,3800)}]})})
  const d=await res.json(); if(d.error) throw new Error(d.error.message); const j=safeJson(d.choices?.[0]?.message?.content||''); if(!j) throw new Error('AI вернул не JSON'); return j
}

async function groqBriefing(key, model, macro, news){
  if(!key) throw new Error('Нет Groq key')
  const prompt=`Ты брифует интрадей трейдера. Дай ГОЛОСОВОЙ брифинг на 60 секунд — как будто говоришь в микрофон. Структура:
1. Режим рынка (1 фраза)
2. Главный катализатор дня (1 фраза)  
3. Топ-3 сетапа по активам с bias и условием входа
4. Что НЕ делать сегодня (1 фраза)
5. Kill Zone фокус (London или NY)
Пиши живо, без воды, как профи говорит другому профи. На русском. Максимум 180 слов.`
  const payload = { macro: { bias: macro.macroBias, dollar: macro.dollarBias, headline: macro.headline, drivers: macro.drivers }, topNews: news.slice(0,3).map(n=>n.headline) }
  const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({model:model||'llama-3.3-70b-versatile',temperature:.35,max_tokens:320,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(payload)}]})})
  const d=await res.json(); if(d.error) throw new Error(d.error.message); return d.choices?.[0]?.message?.content||''
}

// --- Session Clock Hook ---
function useSessionClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  
  const berlinHour = parseFloat(new Intl.DateTimeFormat('en-US', { hour:'numeric', minute:'numeric', hour12:false, timeZone:'Europe/Berlin' }).format(now).replace(':','.'))
  
  const sessions = SESSIONS.map(s => {
    const active = berlinHour >= s.start && berlinHour < s.end
    const minutesLeft = active ? Math.round((s.end - berlinHour) * 60) : null
    const minutesTo = !active && berlinHour < s.start ? Math.round((s.start - berlinHour) * 60) : null
    return { ...s, active, minutesLeft, minutesTo }
  })
  
  const killZones = KILL_ZONES.map(kz => {
    const active = berlinHour >= kz.start && berlinHour < kz.end
    const minutesLeft = active ? Math.round((kz.end - berlinHour) * 60) : null
    const minutesTo = !active && berlinHour < kz.start ? Math.round((kz.start - berlinHour) * 60) : null
    return { ...kz, active, minutesLeft, minutesTo }
  })
  
  const timeStr = new Intl.DateTimeFormat('ru-RU', { hour:'2-digit', minute:'2-digit', second:'2-digit', timeZone:'Europe/Berlin' }).format(now)
  return { sessions, killZones, timeStr, berlinHour }
}

// --- Event Countdown Hook ---
function useEventCountdown(calendar) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(x => x+1), 1000)
    return () => clearInterval(t)
  }, [])
  
  const now = Date.now()
  const upcoming = calendar
    .filter(e => impactOf(e) === 'high' && new Date(e.date).getTime() > now)
    .sort((a,b) => new Date(a.date) - new Date(b.date))
  
  const next = upcoming[0]
  if (!next) return { next: null, seconds: 0, display: '--:--:--' }
  
  const diff = Math.max(0, Math.floor((new Date(next.date).getTime() - now) / 1000))
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  const s = diff % 60
  const display = h > 0 ? `${h}ч ${m.toString().padStart(2,'0')}м ${s.toString().padStart(2,'0')}с` : `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`
  const isHot = diff < 600 // < 10 min
  const isVeryHot = diff < 120 // < 2 min
  
  return { next, seconds: diff, display, isHot, isVeryHot }
}

// ---- Components ----

function Loading(){
  return <div className="boot">
    <div className="sonar-bg"/>
    <div className="sonar-core"><span/><i/><b>MD</b></div>
    <h1>MARKET DEVILS</h1>
    <p>macro flow · risk calendar · session clock · AI briefing</p>
    <div className="boot-ticks"><span>MACRO RADAR</span><span>KILL ZONES</span><span>AI BRIEFING</span><span>SENTIMENT</span></div>
    <div className="loader"><i/></div>
  </div>
}

function AssetTab({asset, active, onClick, macro}){
  const assetBias = macro?.assetBias?.find(x => x.asset?.replace('/','').toUpperCase().includes(asset.id.replace('SP500','SP').replace('NASDAQ','NASDAQ')) || x.asset===asset.label)
  const b = asset.id==='ALL' ? macro?.macroBias : assetBias?.bias || 'SCAN'
  return <button onClick={onClick} className={`asset-card ${asset.className} ${active?'active':''}`}>
    <span className="asset-icon">{asset.icon}</span>
    <span><b>{asset.label}</b><em>{asset.name}</em></span>
    <strong className={String(b).toLowerCase()}>{b}</strong>
  </button>
}

function MarketPulse({macro}){
  const list = macro?.assetBias || []
  return <div className="pulse-grid">
    <div className="pulse-main"><span>Market Mode</span><b>{macro.regime?.label||macro.macroBias}</b><em>{macro.regime?.meaning||'режим рассчитывается из новостей и календаря'}</em></div>
    <div><span>USD Bias</span><b>{macro.dollarBias}</b><em>ключ для FX / Gold / Indices</em></div>
    <div><span>Confidence</span><b>{macro.confidence}%</b><em>совпадение факторов</em></div>
    <div><span>Focus Asset</span><b>{macro.primaryAsset}</b><em>главный драйвер дня</em></div>
    {list.slice(0,4).map((a,i)=><div key={i}><span>{a.asset}</span><b className={a.bias?.toLowerCase()}>{a.bias}</b><em>{a.trigger}</em></div>)}
  </div>
}

function SessionClockPanel({ sessionData }) {
  const { sessions, killZones, timeStr } = sessionData
  const activeKZ = killZones.find(k => k.active)
  const nextKZ = killZones.find(k => !k.active && k.minutesTo !== null)
  
  return <div className="session-panel">
    <div className="session-header">
      <div className="session-clock-time">{timeStr}<span>BERLIN</span></div>
      {activeKZ && <div className="kz-badge active" style={{color: activeKZ.color}}>⚡ {activeKZ.label} ACTIVE — {activeKZ.minutesLeft}м</div>}
      {!activeKZ && nextKZ && <div className="kz-badge" style={{color: nextKZ.color}}>⏱ {nextKZ.label} через {nextKZ.minutesTo}м</div>}
    </div>
    <div className="sessions-row">
      {sessions.map(s => (
        <div key={s.id} className={`session-item ${s.active ? 'active' : ''}`} style={s.active ? {borderColor: s.color, background: s.dim} : {}}>
          <span style={s.active ? {color: s.color} : {}}>{s.label}</span>
          <b>{s.start}:00–{s.end}:00</b>
          {s.active && <em style={{color: s.color}}>LIVE · {s.minutesLeft}м</em>}
          {!s.active && s.minutesTo !== null && <em>через {s.minutesTo}м</em>}
          {!s.active && s.minutesTo === null && <em className="closed">closed</em>}
        </div>
      ))}
    </div>
    <div className="kz-row">
      {killZones.map(kz => (
        <div key={kz.id} className={`kz-item ${kz.active ? 'active' : ''}`} style={kz.active ? {borderColor: kz.color} : {}}>
          <div className="kz-dot" style={{background: kz.color}}/>
          <div>
            <b>{kz.label}</b>
            <span>{kz.start}:00–{kz.end}:00</span>
          </div>
          <em style={kz.active ? {color: kz.color, fontWeight:900} : {}}>
            {kz.active ? `⚡ ${kz.minutesLeft}м` : kz.minutesTo !== null ? `+${kz.minutesTo}м` : '—'}
          </em>
        </div>
      ))}
    </div>
  </div>
}

function EventCountdownWidget({ countdown, calendar }) {
  const { next, display, isHot, isVeryHot } = countdown
  const upcoming = calendar.filter(e => impactOf(e) === 'high' && new Date(e.date).getTime() > Date.now()).slice(0,4)
  
  return <div className={`countdown-panel ${isHot ? 'hot' : ''} ${isVeryHot ? 'very-hot' : ''}`}>
    <div className="countdown-header">
      <span>СЛЕДУЮЩИЙ HIGH IMPACT</span>
      {next ? <div className={`countdown-timer ${isVeryHot ? 'pulse-red' : isHot ? 'pulse-amber' : ''}`}>{display}</div> : <div className="countdown-timer">—</div>}
    </div>
    {next && <div className="countdown-event">
      <b>{next.country} · {next.event}</b>
      <em>{next.estimate ? `прогноз: ${next.estimate}` : ''} {next.previous ? `· пред: ${next.previous}` : ''}</em>
      {isHot && <div className="countdown-warning">⚠️ {isVeryHot ? 'СТОП! Убери позиции, волатильность неизбежна' : 'Готовься — снижай экспозицию, жди факта'}</div>}
    </div>}
    {upcoming.length > 1 && <div className="upcoming-events">
      {upcoming.slice(1,4).map((e,i) => <div key={i} className="upcoming-item">
        <span>{timeFmt(e.date)}</span>
        <b>{e.country} {e.event}</b>
      </div>)}
    </div>}
  </div>
}

function SentimentGauge({ sentiment, macro }) {
  const { score, label, tone } = sentiment
  const angle = -90 + (score / 100) * 180
  const color = tone === 'bull' ? '#28d17c' : tone === 'bear' ? '#ff4d6d' : '#f6b44b'
  
  return <div className="sentiment-panel">
    <div className="sentiment-header"><span>РЫНОЧНЫЙ СЕНТИМЕНТ</span><em>по headline flow</em></div>
    <div className="gauge-wrap">
      <svg viewBox="0 0 200 120" className="gauge-svg">
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ff4d6d" stopOpacity="0.9"/>
            <stop offset="50%" stopColor="#f6b44b" stopOpacity="0.9"/>
            <stop offset="100%" stopColor="#28d17c" stopOpacity="0.9"/>
          </linearGradient>
        </defs>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" strokeLinecap="round"/>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#gaugeGrad)" strokeWidth="14" strokeLinecap="round" opacity="0.7"/>
        <line
          x1="100" y1="100"
          x2={100 + 62 * Math.cos((angle - 90) * Math.PI / 180)}
          y2={100 + 62 * Math.sin((angle - 90) * Math.PI / 180)}
          stroke={color} strokeWidth="3" strokeLinecap="round"
          style={{filter: `drop-shadow(0 0 8px ${color})`}}
        />
        <circle cx="100" cy="100" r="7" fill={color} style={{filter:`drop-shadow(0 0 10px ${color})`}}/>
        <text x="20" y="118" fill="#ff4d6d" fontSize="10" textAnchor="middle">FEAR</text>
        <text x="100" y="30" fill="#f6b44b" fontSize="10" textAnchor="middle">NEUTRAL</text>
        <text x="180" y="118" fill="#28d17c" fontSize="10" textAnchor="middle">GREED</text>
      </svg>
      <div className="gauge-score" style={{color}}><b>{score}</b><span>{label}</span></div>
    </div>
    <div className="sentiment-meta">
      <div><span>📈 Bullish сигналов</span><b style={{color:'#28d17c'}}>{sentiment.bull}</b></div>
      <div><span>📉 Bearish сигналов</span><b style={{color:'#ff4d6d'}}>{sentiment.bear}</b></div>
      <div><span>Режим</span><b>{macro.regime?.label}</b></div>
    </div>
  </div>
}

function DXYFlowMap({ macro }) {
  const dxyBull = macro.dollarBias === 'BULLISH'
  const dxyBear = macro.dollarBias === 'BEARISH'
  
  const correlations = [
    { asset:'EUR/USD', corr: dxyBull ? -1 : dxyBear ? 1 : 0, note: dxyBull ? 'Давление вниз' : dxyBear ? 'Импульс вверх' : 'Нейтрально' },
    { asset:'GBP/USD', corr: dxyBull ? -0.85 : dxyBear ? 0.85 : 0, note: dxyBull ? 'Следует за EUR' : dxyBear ? 'Может outperform' : 'Следит за EUR' },
    { asset:'XAU/USD', corr: dxyBull ? -0.75 : dxyBear ? 0.9 : 0.1, note: dxyBull ? 'Негативная корреляция' : dxyBear ? 'Сильный попутный ветер' : 'Real yields важнее' },
    { asset:'NASDAQ', corr: dxyBull ? -0.6 : dxyBear ? 0.55 : 0, note: dxyBull ? 'Yields up → tech давление' : dxyBear ? 'Liquidity условия лучше' : 'Earnings важнее' },
    { asset:'S&P 500', corr: dxyBull ? -0.5 : dxyBear ? 0.5 : 0.05, note: dxyBull ? 'Умеренное давление' : dxyBear ? 'Risk-on поддержка' : 'Смешанные сигналы' },
    { asset:'GER40', corr: dxyBull ? -0.55 : dxyBear ? 0.6 : 0, note: dxyBull ? 'Двойной удар: USD + EUR' : dxyBear ? 'EUR + risk-on' : 'ECB доминирует' },
  ]
  
  return <div className="dxy-panel">
    <div className="panel-head"><h2>DXY Корреляция</h2><span className={`dxy-badge ${macro.dollarBias.toLowerCase()}`}>DXY {macro.dollarBias}</span></div>
    <div className="dxy-grid">
      {correlations.map((c,i) => {
        const pct = Math.abs(c.corr) * 100
        const dir = c.corr > 0.1 ? 'pos' : c.corr < -0.1 ? 'neg' : 'flat'
        return <div key={i} className={`dxy-row ${dir}`}>
          <span>{c.asset}</span>
          <div className="dxy-bar-wrap">
            {c.corr < 0 && <div className="dxy-bar neg-bar" style={{width:`${pct}%`}}/>}
            {c.corr >= 0 && <div className="dxy-bar pos-bar" style={{width:`${pct || 4}%`}}/>}
          </div>
          <em>{c.note}</em>
          <b className={dir}>{c.corr > 0.1 ? '▲' : c.corr < -0.1 ? '▼' : '—'}</b>
        </div>
      })}
    </div>
    {macro.dxyCorrNarrative && <p className="dxy-narrative">{macro.dxyCorrNarrative}</p>}
  </div>
}

function BriefingPanel({ groqKey, model, macro, news }) {
  const [briefing, setBriefing] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  
  const generate = async () => {
    if (!groqKey) { setErr('Нет Groq API key'); return }
    setLoading(true); setErr(''); setBriefing('')
    try {
      const text = await groqBriefing(groqKey, model, macro, news)
      setBriefing(text)
    } catch(e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  
  return <div className="briefing-panel">
    <div className="panel-head"><h2>AI Брифинг</h2><span>60-секундный голосовой формат</span></div>
    {!briefing && !loading && <div className="briefing-placeholder">
      <p>Нажми кнопку — Groq сгенерирует брифинг дня как будто говорит опытный трейдер коллеге. Главное, сетапы, что не делать.</p>
      <button className="briefing-btn" onClick={generate} disabled={!groqKey}>
        {groqKey ? '🎙 Сгенерировать брифинг' : '🔑 Нужен Groq key'}
      </button>
    </div>}
    {loading && <div className="briefing-loading"><div className="briefing-dots"><span/><span/><span/></div><p>Groq анализирует поток...</p></div>}
    {briefing && <div className="briefing-text">
      <div className="briefing-content">{briefing}</div>
      <button className="briefing-regen" onClick={generate}>↻ Обновить</button>
    </div>}
    {err && <div className="err" style={{marginTop:10}}>{err}</div>}
  </div>
}

function BiasCard({a}){
  return <div className={`bias-card ${a.bias?.includes('SHORT')?'short':a.bias?.includes('LONG')?'long':'wait'}`}>
    <div><b>{a.asset}</b><span>{a.bias}</span></div>
    <p>{a.reason}</p>
    <dl>
      <dt>⚡ Вход</dt><dd>{a.trigger}</dd>
      <dt>❌ Отмена</dt><dd>{a.risk}</dd>
    </dl>
  </div>
}

function ScenarioCard({s}){
  return <div className="scenario">
    <div><b>{s.name}</b><span>{s.prob}%</span></div>
    <p>{s.play}</p>
    <div className="prob"><i style={{width:`${clamp(s.prob||0,0,100)}%`}}/></div>
  </div>
}

function EventRow({e}){
  const im=impactOf(e)
  return <div className={`event ${im}`}>
    <div className="impact-dot"/>
    <b>{timeFmt(e.date)}</b>
    <span>{e.country}</span>
    <p>{e.event}</p>
    <em>{e.estimate ? `прогноз ${e.estimate}` : ''} {e.actual ? `· факт: ${e.actual}` : ''}</em>
  </div>
}

function NewsCard({n, selected}){
  const im=newsImpact(n)
  return <article className={`news-card ${im.toLowerCase()}`}>
    <div>
      <div className="news-meta">
        <em>{im}</em>
        <small>{n.source||'News'}</small>
      </div>
      <b>{shortText(n.headline,160)}</b>
      <p>{shortText(n.summary||'',210)}</p>
      <strong>{ruTake(n)}</strong>
    </div>
    <span>{n.datetime ? timeFmt(n.datetime*1000) : '—'}</span>
  </article>
}

export default function App(){
  const [keys] = useState(() => ({
    groq: DEFAULT_KEYS.groq || localStorage.getItem(LS.groq) || '',
    finnhub: DEFAULT_KEYS.finnhub || localStorage.getItem(LS.finnhub) || '',
    model: DEFAULT_KEYS.model || localStorage.getItem(LS.model) || 'llama-3.3-70b-versatile',
    autoAi: true
  }))
  const [selected, setSelected] = useState('ALL')
  const [news, setNews] = useState([])
  const [calendar, setCalendar] = useState([])
  const [ai, setAi] = useState(null)
  const [aiAsset, setAiAsset] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [updated, setUpdated] = useState(null)
  const [aiStatus, setAiStatus] = useState('локальный анализ')
  const lastAiRef = useRef(0)
  const selectedRef = useRef(selected)
  useEffect(() => { selectedRef.current = selected }, [selected])

  const sessionData = useSessionClock()
  const local = useMemo(() => localMacro(news, calendar, selected), [news, calendar, selected])
  const macro = useMemo(() => ai && aiAsset === selected ? {...local,...ai} : local, [ai, aiAsset, local, selected])
  const visibleNews = useMemo(() => filterNews(news, selected), [news, selected])
  const highEvents = useMemo(() => calendar.filter(e=>impactOf(e)!=='low').sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,16), [calendar])
  const sentiment = useMemo(() => calcSentiment(visibleNews), [visibleNews])
  const countdown = useEventCountdown(calendar)

  const runAiFor = useCallback(async(assetId, n, c) => {
    if(!keys.groq || !keys.autoAi) { setAiStatus('локальный анализ'); return }
    setAiStatus('AI обновляет...')
    const assetNews = filterNews(n, assetId).slice(0,5)
    const importantCal = c.filter(x=>impactOf(x)!=='low').slice(0,6)
    try {
      const result = await groqAnalyze(keys.groq, keys.model, {asset:assetId, news:assetNews.map(x=>({h:x.headline,s:shortText(x.summary,70),src:x.source,impact:newsImpact(x)})), calendar:importantCal.map(x=>({c:x.country,e:x.event,i:impactOf(x),est:x.estimate,t:x.date}))})
      setAi(result); setAiAsset(assetId); lastAiRef.current = Date.now(); setAiStatus('AI активен')
    } catch(e) { setErr(e.message); setAiStatus('локальный анализ'); setAi(null); setAiAsset(null) }
  }, [keys.groq, keys.model, keys.autoAi])

  const refreshData = useCallback(async({forceAi=false, silent=false}={}) => {
    if(!silent) setBusy(true)
    setErr('')
    const scrollY = window.scrollY
    try {
      const [n,c] = await Promise.all([fetchFinnhubNews(keys.finnhub), fetchFinnhubCalendar(keys.finnhub)])
      setNews(n); setCalendar(c); setUpdated(new Date())
      const shouldAi = keys.groq && keys.autoAi && (forceAi || Date.now()-lastAiRef.current > 5*60*1000)
      if(shouldAi) runAiFor(selectedRef.current, n, c)
    } catch(e) { setErr(e.message) }
    finally {
      if(!silent) setBusy(false)
      setLoading(false)
      requestAnimationFrame(() => { if(silent && Math.abs(window.scrollY-scrollY)>24) window.scrollTo({top:scrollY}) })
    }
  }, [keys.finnhub, keys.groq, keys.autoAi, runAiFor])

  useEffect(() => {
    refreshData({forceAi:true})
    const t = setInterval(() => refreshData({silent:true}), 60000)
    return () => clearInterval(t)
  }, [refreshData])

  useEffect(() => {
    if(news.length && calendar.length && keys.groq && keys.autoAi){
      const t = setTimeout(() => runAiFor(selected, news, calendar), 160)
      return () => clearTimeout(t)
    }
  }, [selected, news.length, calendar.length, keys.groq, keys.autoAi, runAiFor])

  if(loading) return <Loading />

  return <div className="app">
    <header className="topbar">
      <div className="brand"><span>◈</span><b>MARKET DEVILS</b><em>MACRO OS v20</em></div>
      <div className="topbar-center">
        <SessionClockPanel sessionData={sessionData}/>
      </div>
      <div className="top-status">
        <span className={busy ? 'syncing' : 'live'}>{busy ? 'SYNC' : 'LIVE'}</span>
        <b>{updated ? timeFmt(updated) : '--:--'}</b>
        <em>{aiStatus}</em>
        <button className="mini-refresh" onClick={() => refreshData({forceAi:true})}>↻</button>
      </div>
    </header>

    {/* Event Countdown Strip */}
    <EventCountdownWidget countdown={countdown} calendar={calendar}/>

    <section className="hero terminal-card">
      <div className="hero-left">
        <div className="asset-tabs asset-grid">
          {ASSETS.map(a => <AssetTab key={a.id} asset={a} active={selected===a.id} macro={macro} onClick={()=>setSelected(a.id)}/>)}
        </div>
        <h1>{macro.headline}</h1>
        <p>{macro.ictNarrative}</p>
        <div className="driver-list">{macro.drivers?.map((d,i)=><span key={i}>{d}</span>)}</div>
        {err && <div className="err inline">{err}</div>}
      </div>
      <MarketPulse macro={macro}/>
    </section>

    <main className="workspace no-settings">
      {/* Row 1: Bias Matrix */}
      <section className="panel wide">
        <div className="panel-head"><h2>Bias Matrix</h2><span>что торговать сегодня · macro + calendar + news</span></div>
        <div className="bias-grid">{macro.assetBias?.map((a,i)=><BiasCard key={i} a={a}/>)}</div>
      </section>

      {/* Row 2: Sentiment + DXY + Briefing */}
      <SentimentGauge sentiment={sentiment} macro={macro}/>
      <DXYFlowMap macro={macro}/>
      <BriefingPanel groqKey={keys.groq} model={keys.model} macro={macro} news={visibleNews}/>

      {/* Row 3: Scenarios + Execution */}
      <section className="panel">
        <div className="panel-head"><h2>Сценарии снятия</h2><span>что ждать первым</span></div>
        <div className="scenario-grid">{macro.scenarios?.map((s,i)=><ScenarioCard key={i} s={s}/>)}</div>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Execution Protocol</h2><span>разжевано для входа</span></div>
        <div className="protocol">
          <div><b>До новости</b><p>{macro.executionPlan?.beforeNews}</p></div>
          <div><b>После факта</b><p>{macro.executionPlan?.afterNews}</p></div>
          <div><b>Стоп-режим</b><p>{macro.executionPlan?.avoid}</p></div>
        </div>
      </section>

      {/* Calendar */}
      <section className="panel calendar-panel">
        <div className="panel-head"><h2>Календарь риска</h2><span>high / medium</span></div>
        <div className="event-list">{highEvents.map((e,i)=><EventRow key={i} e={e}/>)}</div>
      </section>

      {/* News */}
      <section className="panel macro-panel">
        <div className="panel-head"><h2>Новости · макро поток</h2><span>{visibleNews.length} заголовков · автообновление</span></div>
        <div className="news-stack">{visibleNews.map((n,i)=><NewsCard key={n.id||n.headline||i} n={n} selected={selected}/>)}</div>
      </section>
    </main>
    <footer>© Market Devils · Macro OS v20 · не является финансовым советом</footer>
  </div>
}
