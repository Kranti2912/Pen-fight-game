"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { RotateCcw, Trophy, Frown } from "lucide-react"

interface Pen {
  x: number
  y: number
  vx: number
  vy: number
  angle: number
  width: number
  height: number
  color: string
  capColor: string
}

interface GamePhysicsState {
  playerPen: Pen
  aiPen: Pen
  isPlayerTurn: boolean
  waitingForPensToStop: boolean
  aiHasMoved: boolean
}

interface GameUIState {
  isPlayerTurn: boolean
  gameOver: boolean
  winner: "player" | "ai" | null
  playerScore: number
  aiScore: number
  roundOver: boolean
  showInstructions: boolean
}

const CANVAS_WIDTH = 600
const CANVAS_HEIGHT = 600
const TABLE_PADDING = 50
const SIMULATION_HZ = 60
const SIMULATION_STEP_MS = 1000 / SIMULATION_HZ
const MAX_FRAME_DELTA_MS = 100
const MAX_CATCH_UP_STEPS = 6
const TABLE_FRICTION_COEFFICIENT = 0.15
const GRAVITY_METERS_PER_SECOND_SQUARED = 9.81
const WORLD_PIXELS_PER_METER = 600
const TABLE_FRICTION_PER_TICK =
  (TABLE_FRICTION_COEFFICIENT * GRAVITY_METERS_PER_SECOND_SQUARED * WORLD_PIXELS_PER_METER) /
  SIMULATION_HZ ** 2
const MIN_VELOCITY = 0.1
const MAX_FLICK_POWER = 25
const PEN_WIDTH = 80
const PEN_HEIGHT = 14

function createInitialPens(): { playerPen: Pen; aiPen: Pen } {
  return {
    playerPen: {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT - TABLE_PADDING - 80,
      vx: 0,
      vy: 0,
      angle: 0,
      width: PEN_WIDTH,
      height: PEN_HEIGHT,
      color: "#3b82f6",
      capColor: "#1d4ed8",
    },
    aiPen: {
      x: CANVAS_WIDTH / 2,
      y: TABLE_PADDING + 80,
      vx: 0,
      vy: 0,
      angle: Math.PI,
      width: PEN_WIDTH,
      height: PEN_HEIGHT,
      color: "#ef4444",
      capColor: "#b91c1c",
    },
  }
}

export default function PenFightGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  
  // UI state (for React rendering)
  const [uiState, setUIState] = useState<GameUIState>({
    isPlayerTurn: true,
    gameOver: false,
    winner: null,
    playerScore: 0,
    aiScore: 0,
    roundOver: false,
    showInstructions: true,
  })
  
  // Physics state (stored in ref for game loop performance)
  const physicsRef = useRef<GamePhysicsState>({
    ...createInitialPens(),
    isPlayerTurn: true,
    waitingForPensToStop: false,
    aiHasMoved: false,
  })
  
  // Drag state
  const dragRef = useRef<{
    isDragging: boolean
    startX: number
    startY: number
    endX: number
    endY: number
  }>({
    isDragging: false,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  })

  const isPenOnTable = (pen: Pen): boolean => {
    return (
      pen.x > TABLE_PADDING &&
      pen.x < CANVAS_WIDTH - TABLE_PADDING &&
      pen.y > TABLE_PADDING &&
      pen.y < CANVAS_HEIGHT - TABLE_PADDING
    )
  }

  const checkCollision = (pen1: Pen, pen2: Pen): boolean => {
    const dx = pen1.x - pen2.x
    const dy = pen1.y - pen2.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    // Use a radius that makes sense for pen-shaped objects
    const collisionRadius = (pen1.width / 2 + pen2.width / 2) * 0.6
    return distance < collisionRadius
  }

  const resolveCollision = (pen1: Pen, pen2: Pen): void => {
    const dx = pen2.x - pen1.x
    const dy = pen2.y - pen1.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    if (distance === 0) {
      // Pens are exactly on top of each other, push them apart randomly
      pen2.x += 5
      pen2.y += 5
      return
    }
    
    // Collision radius
    const collisionRadius = (pen1.width / 2 + pen2.width / 2) * 0.6
    
    // Normal vector from pen1 to pen2
    const nx = dx / distance
    const ny = dy / distance
    
    // Tangent vector (perpendicular to normal)
    const tx = -ny
    const ty = nx
    
    // Project velocities onto normal and tangent
    const v1n = pen1.vx * nx + pen1.vy * ny
    const v1t = pen1.vx * tx + pen1.vy * ty
    const v2n = pen2.vx * nx + pen2.vy * ny
    const v2t = pen2.vx * tx + pen2.vy * ty
    
    // For elastic collision with equal masses, normal components are swapped
    // Tangent components stay the same (no friction)
    const restitution = 0.85
    
    // New normal velocities (1D elastic collision formula for equal masses)
    const v1nNew = v2n * restitution
    const v2nNew = v1n * restitution
    
    // Convert back to x,y velocities
    pen1.vx = v1nNew * nx + v1t * tx
    pen1.vy = v1nNew * ny + v1t * ty
    pen2.vx = v2nNew * nx + v2t * tx
    pen2.vy = v2nNew * ny + v2t * ty
    
    // Separate pens to prevent overlap
    const overlap = collisionRadius - distance
    if (overlap > 0) {
      const separationX = nx * (overlap / 2 + 2)
      const separationY = ny * (overlap / 2 + 2)
      pen1.x -= separationX
      pen1.y -= separationY
      pen2.x += separationX
      pen2.y += separationY
    }
  }

  const applyTableFriction = (pen: Pen): void => {
    const speed = Math.hypot(pen.vx, pen.vy)

    if (speed <= TABLE_FRICTION_PER_TICK) {
      pen.vx = 0
      pen.vy = 0
      return
    }

    const remainingSpeed = speed - TABLE_FRICTION_PER_TICK
    const frictionScale = remainingSpeed / speed
    pen.vx *= frictionScale
    pen.vy *= frictionScale
  }

  const arePensMoving = (): boolean => {
    const { playerPen, aiPen } = physicsRef.current
    const playerMoving = Math.abs(playerPen.vx) > MIN_VELOCITY || Math.abs(playerPen.vy) > MIN_VELOCITY
    const aiMoving = Math.abs(aiPen.vx) > MIN_VELOCITY || Math.abs(aiPen.vy) > MIN_VELOCITY
    return playerMoving || aiMoving
  }

  const performAITurn = useCallback(() => {
    const physics = physicsRef.current
    if (physics.isPlayerTurn || physics.aiHasMoved) return
    
    const dx = physics.playerPen.x - physics.aiPen.x
    const dy = physics.playerPen.y - physics.aiPen.y
    const distance = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)
    
    // Choose enough speed to reach the player despite table friction, with a little variation.
    const distanceToContact = Math.max(distance - PEN_WIDTH * 0.6, 0)
    const powerToReachContact = Math.sqrt(2 * TABLE_FRICTION_PER_TICK * distanceToContact)
    const power = Math.min(MAX_FLICK_POWER, powerToReachContact * (1.08 + Math.random() * 0.2))
    const randomAngle = angle + (Math.random() - 0.5) * 0.24
    
    physics.aiPen.vx = Math.cos(randomAngle) * power
    physics.aiPen.vy = Math.sin(randomAngle) * power
    physics.waitingForPensToStop = true
    physics.aiHasMoved = true
  }, [])

  const resetRound = useCallback(() => {
    const pens = createInitialPens()
    physicsRef.current = {
      ...pens,
      isPlayerTurn: true,
      waitingForPensToStop: false,
      aiHasMoved: false,
    }
    setUIState(prev => ({
      ...prev,
      isPlayerTurn: true,
      roundOver: false,
    }))
  }, [])

  const resetGame = useCallback(() => {
    const pens = createInitialPens()
    physicsRef.current = {
      ...pens,
      isPlayerTurn: true,
      waitingForPensToStop: false,
      aiHasMoved: false,
    }
    setUIState({
      isPlayerTurn: true,
      gameOver: false,
      winner: null,
      playerScore: 0,
      aiScore: 0,
      roundOver: false,
      showInstructions: false,
    })
  }, [])

  // Main game loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let aiTurnTimeout: NodeJS.Timeout | null = null
    let previousTimestamp: number | null = null
    let accumulator = 0
    let roundOutcomeHandled = false

    const gameLoop = (timestamp: number) => {
      const elapsed = previousTimestamp === null ? 0 : Math.min(timestamp - previousTimestamp, MAX_FRAME_DELTA_MS)
      previousTimestamp = timestamp
      accumulator = Math.min(accumulator + elapsed, SIMULATION_STEP_MS * MAX_CATCH_UP_STEPS)

      while (accumulator >= SIMULATION_STEP_MS) {
        const physics = physicsRef.current

        if (!uiState.gameOver && !uiState.roundOver && !roundOutcomeHandled) {
          // Velocities are pixels per fixed simulation tick.
          physics.playerPen.x += physics.playerPen.vx
          physics.playerPen.y += physics.playerPen.vy
          physics.aiPen.x += physics.aiPen.vx
          physics.aiPen.y += physics.aiPen.vy

          // Check collision before table friction slows the pens for the next tick.
          if (checkCollision(physics.playerPen, physics.aiPen)) {
            resolveCollision(physics.playerPen, physics.aiPen)
          }

          applyTableFriction(physics.playerPen)
          applyTableFriction(physics.aiPen)

          // Update angles based on velocity
          if (Math.abs(physics.playerPen.vx) > 0.5 || Math.abs(physics.playerPen.vy) > 0.5) {
            physics.playerPen.angle = Math.atan2(physics.playerPen.vy, physics.playerPen.vx)
          }
          if (Math.abs(physics.aiPen.vx) > 0.5 || Math.abs(physics.aiPen.vy) > 0.5) {
            physics.aiPen.angle = Math.atan2(physics.aiPen.vy, physics.aiPen.vx)
          }

          // Check if pens fell off table
          const playerOnTable = isPenOnTable(physics.playerPen)
          const aiOnTable = isPenOnTable(physics.aiPen)

          if (!playerOnTable || !aiOnTable) {
            roundOutcomeHandled = true
            accumulator = 0

            if (!playerOnTable && !aiOnTable) {
              setUIState(prev => ({ ...prev, roundOver: true }))
            } else if (!playerOnTable) {
              setUIState(prev => {
                const newAiScore = prev.aiScore + 1
                if (newAiScore >= 3) {
                  return { ...prev, aiScore: newAiScore, gameOver: true, winner: "ai" }
                }
                return { ...prev, aiScore: newAiScore, roundOver: true }
              })
            } else {
              setUIState(prev => {
                const newPlayerScore = prev.playerScore + 1
                if (newPlayerScore >= 3) {
                  return { ...prev, playerScore: newPlayerScore, gameOver: true, winner: "player" }
                }
                return { ...prev, playerScore: newPlayerScore, roundOver: true }
              })
            }

            break
          }

          // Check if pens stopped moving
          if (!arePensMoving() && physics.waitingForPensToStop) {
            physics.playerPen.vx = 0
            physics.playerPen.vy = 0
            physics.aiPen.vx = 0
            physics.aiPen.vy = 0
            physics.waitingForPensToStop = false

            if (physics.isPlayerTurn) {
              physics.isPlayerTurn = false
              physics.aiHasMoved = false
              setUIState(prev => ({ ...prev, isPlayerTurn: false }))

              if (aiTurnTimeout) clearTimeout(aiTurnTimeout)
              aiTurnTimeout = setTimeout(() => {
                performAITurn()
              }, 800)
            } else {
              physics.isPlayerTurn = true
              setUIState(prev => ({ ...prev, isPlayerTurn: true }))
            }
          }
        }

        accumulator -= SIMULATION_STEP_MS
      }

      drawGame(ctx, physicsRef.current, dragRef.current)
      animationRef.current = requestAnimationFrame(gameLoop)
    }

    const drawGame = (
      ctx: CanvasRenderingContext2D, 
      physics: GamePhysicsState,
      drag: typeof dragRef.current
    ) => {
      // Clear canvas
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      // Draw wooden table background
      const tableGradient = ctx.createRadialGradient(
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2,
        0,
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2,
        CANVAS_WIDTH / 2
      )
      tableGradient.addColorStop(0, "#8B7355")
      tableGradient.addColorStop(1, "#6B5344")
      
      ctx.fillStyle = tableGradient
      ctx.fillRect(TABLE_PADDING, TABLE_PADDING, CANVAS_WIDTH - TABLE_PADDING * 2, CANVAS_HEIGHT - TABLE_PADDING * 2)

      // Draw wood grain lines
      ctx.strokeStyle = "rgba(0, 0, 0, 0.1)"
      ctx.lineWidth = 1
      for (let i = 0; i < 10; i++) {
        const y = TABLE_PADDING + (CANVAS_HEIGHT - TABLE_PADDING * 2) * (i / 10)
        ctx.beginPath()
        ctx.moveTo(TABLE_PADDING, y)
        ctx.bezierCurveTo(
          CANVAS_WIDTH / 3, y + Math.sin(i) * 5,
          CANVAS_WIDTH * 2 / 3, y - Math.sin(i) * 5,
          CANVAS_WIDTH - TABLE_PADDING, y
        )
        ctx.stroke()
      }

      // Draw table border
      ctx.strokeStyle = "#4a3728"
      ctx.lineWidth = 8
      ctx.strokeRect(TABLE_PADDING, TABLE_PADDING, CANVAS_WIDTH - TABLE_PADDING * 2, CANVAS_HEIGHT - TABLE_PADDING * 2)

      // Draw outer area (floor)
      ctx.fillStyle = "#e8dfd5"
      ctx.fillRect(0, 0, CANVAS_WIDTH, TABLE_PADDING)
      ctx.fillRect(0, CANVAS_HEIGHT - TABLE_PADDING, CANVAS_WIDTH, TABLE_PADDING)
      ctx.fillRect(0, 0, TABLE_PADDING, CANVAS_HEIGHT)
      ctx.fillRect(CANVAS_WIDTH - TABLE_PADDING, 0, TABLE_PADDING, CANVAS_HEIGHT)

      // Draw pens
      drawPen(ctx, physics.playerPen)
      drawPen(ctx, physics.aiPen)

      // Draw drag indicator
      if (drag.isDragging) {
        const dx = drag.startX - drag.endX
        const dy = drag.startY - drag.endY
        const power = Math.min(Math.sqrt(dx * dx + dy * dy), MAX_FLICK_POWER * 4)
        
        ctx.strokeStyle = `rgba(59, 130, 246, ${0.3 + power / 200})`
        ctx.lineWidth = 3
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.moveTo(physics.playerPen.x, physics.playerPen.y)
        ctx.lineTo(physics.playerPen.x + dx, physics.playerPen.y + dy)
        ctx.stroke()
        ctx.setLineDash([])

        // Draw power indicator
        const normalizedPower = power / (MAX_FLICK_POWER * 4)
        ctx.fillStyle = `hsl(${120 - normalizedPower * 120}, 80%, 50%)`
        ctx.beginPath()
        ctx.arc(physics.playerPen.x + dx, physics.playerPen.y + dy, 8 + normalizedPower * 8, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const drawPen = (ctx: CanvasRenderingContext2D, pen: Pen) => {
      ctx.save()
      ctx.translate(pen.x, pen.y)
      ctx.rotate(pen.angle)

      // Pen shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.2)"
      ctx.beginPath()
      ctx.ellipse(3, 3, pen.width / 2, pen.height / 2, 0, 0, Math.PI * 2)
      ctx.fill()

      // Pen body
      ctx.fillStyle = pen.color
      ctx.beginPath()
      ctx.roundRect(-pen.width / 2, -pen.height / 2, pen.width, pen.height, 4)
      ctx.fill()

      // Pen tip
      ctx.fillStyle = "#333"
      ctx.beginPath()
      ctx.moveTo(pen.width / 2, 0)
      ctx.lineTo(pen.width / 2 + 12, 0)
      ctx.lineTo(pen.width / 2, -pen.height / 3)
      ctx.lineTo(pen.width / 2, pen.height / 3)
      ctx.closePath()
      ctx.fill()

      // Pen cap
      ctx.fillStyle = pen.capColor
      ctx.beginPath()
      ctx.roundRect(-pen.width / 2 - 15, -pen.height / 2 - 1, 18, pen.height + 2, 3)
      ctx.fill()

      // Pen clip on cap
      ctx.fillStyle = "#c0c0c0"
      ctx.fillRect(-pen.width / 2 - 12, -pen.height / 2 - 6, 3, pen.height + 8)

      // Shine effect
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)"
      ctx.fillRect(-pen.width / 2 + 5, -pen.height / 2 + 2, pen.width - 20, 3)

      ctx.restore()
    }

    animationRef.current = requestAnimationFrame(gameLoop)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      if (aiTurnTimeout) {
        clearTimeout(aiTurnTimeout)
      }
    }
  }, [uiState.gameOver, uiState.roundOver, performAITurn])

  // Mouse handlers
  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = CANVAS_WIDTH / rect.width
    const scaleY = CANVAS_HEIGHT / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const isNearPen = (pos: { x: number; y: number }, pen: Pen): boolean => {
    const dx = pos.x - pen.x
    const dy = pos.y - pen.y
    return Math.sqrt(dx * dx + dy * dy) < pen.width
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const physics = physicsRef.current
    if (!physics.isPlayerTurn || uiState.gameOver || uiState.roundOver) return
    if (arePensMoving()) return

    const pos = getMousePos(e)
    if (isNearPen(pos, physics.playerPen)) {
      setUIState(prev => ({ ...prev, showInstructions: false }))
      dragRef.current = {
        isDragging: true,
        startX: pos.x,
        startY: pos.y,
        endX: pos.x,
        endY: pos.y,
      }
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.isDragging) return
    const pos = getMousePos(e)
    dragRef.current.endX = pos.x
    dragRef.current.endY = pos.y
  }

  const handleMouseUp = () => {
    const drag = dragRef.current
    if (!drag.isDragging) return

    const dx = drag.startX - drag.endX
    const dy = drag.startY - drag.endY
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    drag.isDragging = false

    if (distance > 10) {
      const power = Math.min(distance / 4, MAX_FLICK_POWER)
      const angle = Math.atan2(dy, dx)

      const physics = physicsRef.current
      physics.playerPen.vx = Math.cos(angle) * power
      physics.playerPen.vy = Math.sin(angle) * power
      physics.waitingForPensToStop = true
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Score display with status in the middle */}
      <div className="flex items-center justify-between w-full gap-8">
        <div className="flex items-center gap-3 bg-primary/10 px-6 py-3 rounded-xl">
          <div className="w-4 h-4 rounded-full bg-primary" />
          <span className="font-bold text-lg text-foreground">You: {uiState.playerScore}</span>
        </div>

        {/* Turn indicator - centered between score cards */}
        <div className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
          uiState.isPlayerTurn 
            ? "bg-primary text-primary-foreground" 
            : "bg-destructive text-destructive-foreground"
        }`}>
          {uiState.isPlayerTurn ? "Your Turn - Flick!" : "AI is thinking..."}
        </div>

        <div className="flex items-center gap-3 bg-destructive/10 px-6 py-3 rounded-xl">
          <div className="w-4 h-4 rounded-full bg-destructive" />
          <span className="font-bold text-lg text-foreground">AI: {uiState.aiScore}</span>
        </div>
      </div>

      {/* Game canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="border-4 border-border rounded-2xl shadow-2xl cursor-crosshair max-w-full"
          style={{ maxWidth: "100%", height: "auto" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />

        {/* Instructions overlay */}
        {uiState.showInstructions && (
          <div className="absolute inset-0 flex items-center justify-center bg-foreground/50 rounded-2xl">
            <div className="bg-card p-6 rounded-xl text-center shadow-xl max-w-xs">
              <h3 className="text-lg font-bold text-card-foreground mb-2">How to Play</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Click and drag on your <span className="text-primary font-bold">blue pen</span> to flick it! 
                Push the <span className="text-destructive font-bold">red pen</span> off the table to score. 
                First to 3 wins!
              </p>
              <Button onClick={() => setUIState(prev => ({ ...prev, showInstructions: false }))}>
                Got it!
              </Button>
            </div>
          </div>
        )}

        {/* Round over overlay */}
        {uiState.roundOver && !uiState.gameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-foreground/50 rounded-2xl">
            <div className="bg-card p-6 rounded-xl text-center shadow-xl">
              <h3 className="text-xl font-bold text-card-foreground mb-4">Round Over!</h3>
              <div className="flex gap-4">
                <Button onClick={resetRound} className="gap-2">
                  <RotateCcw className="w-4 h-4" />
                  Next Round
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Game over overlay */}
        {uiState.gameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-foreground/50 rounded-2xl">
            <div className="bg-card p-8 rounded-xl text-center shadow-xl">
              {uiState.winner === "player" ? (
                <>
                  <Trophy className="w-16 h-16 text-accent mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-card-foreground mb-2">You Win!</h3>
                  <p className="text-muted-foreground mb-6">Congratulations, champion!</p>
                </>
              ) : (
                <>
                  <Frown className="w-16 h-16 text-destructive mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-card-foreground mb-2">AI Wins!</h3>
                  <p className="text-muted-foreground mb-6">Better luck next time!</p>
                </>
              )}
              <Button onClick={resetGame} className="gap-2">
                <RotateCcw className="w-4 h-4" />
                Play Again
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Reset button */}
      <Button variant="outline" onClick={resetGame} className="gap-2">
        <RotateCcw className="w-4 h-4" />
        Restart Game
      </Button>
    </div>
  )
}
