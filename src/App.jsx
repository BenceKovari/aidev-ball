import React, { useEffect, useRef, useState } from 'react'

const GRAVITY = 0.05
const BALL_SIZE = 60
const DB_MIN = -60
const DB_MAX = -6
const OVER_LATCH_MS = 80

export default function App() {
  const containerRef = useRef(null)

  const rafRef = useRef(0)
  const resetTimerRef = useRef(null)
  const lastTsRef = useRef(0)

  // Audio
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const dataFloatRef = useRef(null)
  const dataByteRef = useRef(null)
  const streamRef = useRef(null)

  // Fireworks
  const fxCanvasRef = useRef(null)
  const fxCtxRef = useRef(null)
  const fireworksRef = useRef([])

  // Physics & state
  const yRef = useRef(0)
  const velRef = useRef(0)
  const stateRef = useRef('idle')
  const lastOverRef = useRef(0)
  const wasFallingRef = useRef(false)

  // Threshold: state for UI + ref for logic to avoid stale closure
  const [threshold, setThreshold] = useState(0.12)       // RMS (linear)
  const thresholdRef = useRef(0.12)
  useEffect(() => { thresholdRef.current = threshold }, [threshold])

  // UI state
  const [gameState, setGameState] = useState('idle')
  const [y, setY] = useState(0)
  const [ampDb, setAmpDb] = useState(DB_MIN)
  const [error, setError] = useState('')

  useEffect(() => { stateRef.current = gameState }, [gameState])

  useEffect(() => {
    const canvas = fxCanvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      fxCtxRef.current = ctx
      function resize() {
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.floor(window.innerWidth * dpr)
        canvas.height = Math.floor(320 * dpr)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
      resize()
      const onResize = () => resize()
      window.addEventListener('resize', onResize)
      return () => window.removeEventListener('resize', onResize)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {})
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [])

  async function start() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false }
      })
      streamRef.current = stream

      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const audioCtx = new AudioCtx()
      await audioCtx.resume()
      audioCtxRef.current = audioCtx

      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.2
      source.connect(analyser)

      analyserRef.current = analyser
      dataFloatRef.current = new Float32Array(analyser.fftSize)
      dataByteRef.current = new Uint8Array(analyser.fftSize)

      yRef.current = 0
      velRef.current = 0
      setY(0)
      setGameState('playing')

      if (!rafRef.current) {
        lastTsRef.current = performance.now()
        tick()
      }
    } catch (e) {
      console.error(e)
      setError('Microphone access is required. Please allow it and reload.')
    }
  }

  function readRMS() {
    const analyser = analyserRef.current
    if (!analyser) return 0

    const floats = dataFloatRef.current
    analyser.getFloatTimeDomainData(floats)
    let sum = 0
    for (let i = 0; i < floats.length; i++) sum += floats[i] * floats[i]
    let rms = Math.sqrt(sum / floats.length)

    if (!Number.isFinite(rms) || rms === 0) {
      const bytes = dataByteRef.current
      analyser.getByteTimeDomainData(bytes)
      let sumB = 0
      for (let i = 0; i < bytes.length; i++) {
        const v = (bytes[i] - 128) / 128
        sumB += v * v
      }
      rms = Math.sqrt(sumB / bytes.length)
    }
    return rms
  }

  const rmsToDb = (rms) => 20 * Math.log10(Math.max(1e-8, rms))

  function spawnFirework() {
    const canvas = fxCanvasRef.current
    const ctx = fxCtxRef.current
    if (!canvas || !ctx) return

    const x = Math.random() * window.innerWidth
    const y = 320 - 6

    const colors = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#f97316', '#a78bfa']
    const particles = []
    const count = 26 + Math.floor(Math.random() * 10)
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI - Math.PI / 2
      const speed = 1 + Math.random() * 2.4
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: -Math.abs(Math.sin(angle) * speed) - 1.2,
        life: 600 + Math.random() * 500,
        age: 0,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 4
      })
    }
    fireworksRef.current.push({ particles })
    if (fireworksRef.current.length > 8) fireworksRef.current.shift()
  }

  function updateFireworks(dt) {
    const canvas = fxCanvasRef.current
    const ctx = fxCtxRef.current
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.globalCompositeOperation = 'lighter'
    const list = fireworksRef.current
    for (let i = list.length - 1; i >= 0; i--) {
      const fw = list[i]
      for (let j = fw.particles.length - 1; j >= 0; j--) {
        const p = fw.particles[j]
        p.age += dt
        if (p.age > p.life) { fw.particles.splice(j, 1); continue }
        p.vy += 0.06
        p.x += p.vx * (dt / 16.7)
        p.y += p.vy * (dt / 16.7)
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = p.color; ctx.fill()
      }
      if (fw.particles.length === 0) list.splice(i, 1)
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  function impulseToReachTop() {
    const u = -Math.sqrt(Math.max(0, 2 * GRAVITY * (yRef.current + 1)))
    return Math.min(-6, u)
  }

  function tick() {
    rafRef.current = requestAnimationFrame(tick)
    const now = performance.now()
    const dt = Math.min(48, now - lastTsRef.current)
    lastTsRef.current = now

    const rms = readRMS()
    const db = rmsToDb(rms)
    setAmpDb(db)

    if (rms >= thresholdRef.current) lastOverRef.current = now

    if (stateRef.current === 'playing') {
      const container = containerRef.current
      const h = container ? container.clientHeight : window.innerHeight
      const floor = h - BALL_SIZE

      const isFalling = velRef.current > 0
      const justStartedFalling = !wasFallingRef.current && isFalling
      wasFallingRef.current = isFalling

      const recentlyOver = (now - lastOverRef.current) <= OVER_LATCH_MS
      if ((rms >= thresholdRef.current || recentlyOver) && (isFalling || justStartedFalling)) {
        velRef.current = impulseToReachTop()
        spawnFirework()
      } else {
        velRef.current += GRAVITY
      }
      yRef.current += velRef.current

      if (yRef.current < 0) {
        yRef.current = 0
        velRef.current = Math.max(0, velRef.current)
      }

      if (yRef.current > floor + 8) {
        setGameState('gameover')
        stateRef.current = 'gameover'
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
        resetTimerRef.current = setTimeout(() => {
          yRef.current = 0
          velRef.current = 0
          setY(0)
          setGameState('playing')
          stateRef.current = 'playing'
        }, 3000)
      }

      setY(yRef.current)
    }

    updateFireworks(dt)
  }

  const mapDbToUnit = (db) => Math.max(0, Math.min(1, (db - DB_MIN) / (DB_MAX - DB_MIN)))
  const thresholdDb = rmsToDb(thresholdRef.current)
  const barUnit = mapDbToUnit(ampDb)
  const thUnit = mapDbToUnit(thresholdDb)

  return (
    <div className="game-container" ref={containerRef}>
      {gameState !== 'playing' && (
        <div className={gameState === 'idle' ? 'start-overlay' : 'gameover-overlay'}>
          {gameState === 'idle' ? (
            <div className="start-card">
              <h1>Mic Bounce Ball</h1>
              <p>Immediate bounce when over threshold and falling. Threshold now updates logic via a ref.</p>
              <button className="primary-btn" onClick={start}>Start &amp; Allow Microphone</button>
              {error && <p style={{color: '#ffb4b4', marginTop: 10}}>{error}</p>}
            </div>
          ) : (
            <div style={{display: 'grid', placeItems: 'center', width: '100%', height: '100%'}}>
              <div className="smiley">☹️</div>
            </div>
          )}
        </div>
      )}

      <div className="ball" style={{ top: y + 'px' }} aria-label="blue ball" />

      <div className="controls">
        <div className="row"><strong>Threshold</strong><span>{threshold.toFixed(3)} RMS</span></div>
        <input
          type="range"
          min="0.005"
          max="0.35"
          step="0.001"
          value={threshold}
          onChange={e => setThreshold(parseFloat(e.target.value))}
        />
        <div className="row"><span>&nbsp;</span><span>{thresholdDb.toFixed(1)} dB</span></div>
      </div>

      <canvas ref={fxCanvasRef} className="fireworks-canvas" />

      <div className="level-bar-wrap" aria-label="noise level">
        <div className="level-bar" style={{ transform: `scaleX(${barUnit})` }} />
        <div className="level-ticks" />
        <div className="level-marker" style={{ left: `calc(${(thUnit * 100).toFixed(2)}% - 1px)` }} title={`Threshold: ${thresholdDb.toFixed(1)} dB`} />
        <div className="level-label">{ampDb.toFixed(1)} dB</div>
      </div>

      <div className="footer">(c) BME, VIK, AUT, 2025 - Created with ChatGPT and Claude, see <a href="https://github.com/BenceKovari/aidev-ball" target="_blank" rel="noopener noreferrer">https://github.com/BenceKovari/aidev-ball</a> for details</div>

      <a href="https://github.com/BenceKovari/aidev-ball" target="_blank" rel="noopener noreferrer" className="logo-link">
        <img src="logo.png" alt="AUT Logo" />
      </a>
    </div>
  )
}
