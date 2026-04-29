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

interface GameState {
  playerPen: Pen
  aiPen: Pen
  isPlayerTurn: boolean
  isDragging: boolean
  dragStart: { x: number; y: number } | null
  dragEnd: { x: number; y: number } | null
  gameOver: boolean
  winner: "player" | "ai" | null
  playerScore: number
  aiScore: number
  roundOver: boolean
}

const CANVAS_WIDTH = 600
const CANVAS_HEIGHT = 600
const TABLE_PADDING = 50
const FRICTION = 0.98
const MIN_VELOCITY = 0.1
const MAX_FLICK_POWER = 25
const PEN_WIDTH = 80
const PEN_HEIGHT = 14

export default function PenFightGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const [gameState, setGameState] = useState<GameState>(() => createInitialState())
  const [showInstructions, setShowInstructions] = useState(true)
  const gameStateRef = useRef<GameState>(gameState)
  
  // Keep ref in sync with state
  useEffect(() => {
    gameStateRef.current = gameState
  }, [gameState])

  function createInitialState(): GameState {
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
      isPlayerTurn: true,
      isDragging: false,
      dragStart: null,
      dragEnd: null,
      gameOver: false,
      winner: null,
      playerScore: 0,
      aiScore: 0,
      roundOver: false,
    }
  }

  const resetRound = useCallback(() => {
    setGameState((prev) => ({
      ...prev,
      playerPen: {
        ...prev.playerPen,
        x: CANVAS_WIDTH / 2,
        y: CANVAS_HEIGHT - TABLE_PADDING - 80,
        vx: 0,
        vy: 0,
        angle: 0,
      },
      aiPen: {
        ...prev.aiPen,
        x: CANVAS_WIDTH / 2,
        y: TABLE_PADDING + 80,
        vx: 0,
        vy: 0,
        angle: Math.PI,
      },
      isPlayerTurn: true,
      roundOver: false,
    }))
  }, [])

  const resetGame = useCallback(() => {
    setGameState(createInitialState())
  }, [])

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
    return distance < (pen1.width + pen2.width) / 3
  }

  const resolveCollision = (pen1: Pen, pen2: Pen): [Pen, Pen] => {
    const dx = pen2.x - pen1.x
    const dy = pen2.y - pen1.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    if (distance === 0) return [pen1, pen2]
    
    const nx = dx / distance
    const ny = dy / distance
    
    const relVx = pen1.vx - pen2.vx
    const relVy = pen1.vy - pen2.vy
    const relVn = relVx * nx + relVy * ny
    
    if (relVn > 0) return [pen1, pen2]
    
    const restitution = 0.8
    const impulse = -(1 + restitution) * relVn / 2
    
    return [
      {
        ...pen1,
        vx: pen1.vx + impulse * nx,
        vy: pen1.vy + impulse * ny,
      },
      {
        ...pen2,
        vx: pen2.vx - impulse * nx,
        vy: pen2.vy - impulse * ny,
      },
    ]
  }

  const arePensMoving = (playerPen: Pen, aiPen: Pen): boolean => {
    const playerMoving = Math.abs(playerPen.vx) > MIN_VELOCITY || Math.abs(playerPen.vy) > MIN_VELOCITY
    const aiMoving = Math.abs(aiPen.vx) > MIN_VELOCITY || Math.abs(aiPen.vy) > MIN_VELOCITY
    return playerMoving || aiMoving
  }

  const aiTurn = useCallback(() => {
    setGameState((prev) => {
      if (prev.isPlayerTurn || prev.gameOver || prev.roundOver) {
        return prev
      }
      
      // AI aims at player's pen with some randomness
      const dx = prev.playerPen.x - prev.aiPen.x
      const dy = prev.playerPen.y - prev.aiPen.y
      const angle = Math.atan2(dy, dx)
      
      // Add some randomness to make AI beatable
      const randomAngle = angle + (Math.random() - 0.5) * 0.5
      const power = 10 + Math.random() * 12
      
      const newVx = Math.cos(randomAngle) * power
      const newVy = Math.sin(randomAngle) * power
      
      return {
        ...prev,
        aiPen: {
          ...prev.aiPen,
          vx: newVx,
          vy: newVy,
        },
      }
    })
  }, [])

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const gameLoop = () => {
      setGameState((prev) => {
        if (prev.gameOver || prev.roundOver) return prev

        let newPlayerPen = { ...prev.playerPen }
        let newAiPen = { ...prev.aiPen }

        // Update positions
        newPlayerPen.x += newPlayerPen.vx
        newPlayerPen.y += newPlayerPen.vy
        newAiPen.x += newAiPen.vx
        newAiPen.y += newAiPen.vy

        // Apply friction
        newPlayerPen.vx *= FRICTION
        newPlayerPen.vy *= FRICTION
        newAiPen.vx *= FRICTION
        newAiPen.vy *= FRICTION

        // Update angles based on velocity
        if (Math.abs(newPlayerPen.vx) > 0.5 || Math.abs(newPlayerPen.vy) > 0.5) {
          newPlayerPen.angle = Math.atan2(newPlayerPen.vy, newPlayerPen.vx)
        }
        if (Math.abs(newAiPen.vx) > 0.5 || Math.abs(newAiPen.vy) > 0.5) {
          newAiPen.angle = Math.atan2(newAiPen.vy, newAiPen.vx)
        }

        // Check collision between pens
        if (checkCollision(newPlayerPen, newAiPen)) {
          ;[newPlayerPen, newAiPen] = resolveCollision(newPlayerPen, newAiPen)
        }

        // Check if pens fell off table
        const playerOnTable = isPenOnTable(newPlayerPen)
        const aiOnTable = isPenOnTable(newAiPen)

        if (!playerOnTable || !aiOnTable) {
          let newPlayerScore = prev.playerScore
          let newAiScore = prev.aiScore
          let winner: "player" | "ai" | null = null

          if (!playerOnTable && !aiOnTable) {
            // Both fell - it's a draw, no score change
          } else if (!playerOnTable) {
            newAiScore++
            if (newAiScore >= 3) {
              winner = "ai"
            }
          } else {
            newPlayerScore++
            if (newPlayerScore >= 3) {
              winner = "player"
            }
          }

          return {
            ...prev,
            playerPen: newPlayerPen,
            aiPen: newAiPen,
            playerScore: newPlayerScore,
            aiScore: newAiScore,
            roundOver: winner === null,
            gameOver: winner !== null,
            winner,
          }
        }

        // Check if pens stopped moving - switch turns
        if (!arePensMoving(newPlayerPen, newAiPen)) {
          newPlayerPen.vx = 0
          newPlayerPen.vy = 0
          newAiPen.vx = 0
          newAiPen.vy = 0

          if (!prev.isPlayerTurn) {
            return {
              ...prev,
              playerPen: newPlayerPen,
              aiPen: newAiPen,
              isPlayerTurn: true,
            }
          }
        }

        return {
          ...prev,
          playerPen: newPlayerPen,
          aiPen: newAiPen,
        }
      })

      // Draw
      drawGame(ctx)
      animationRef.current = requestAnimationFrame(gameLoop)
    }

    const drawGame = (ctx: CanvasRenderingContext2D) => {
      const state = gameStateRef.current

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

      // Draw table border (shadow effect)
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
      drawPen(ctx, state.playerPen)
      drawPen(ctx, state.aiPen)

      // Draw drag indicator
      if (state.isDragging && state.dragStart && state.dragEnd) {
        const dx = state.dragStart.x - state.dragEnd.x
        const dy = state.dragStart.y - state.dragEnd.y
        const power = Math.min(Math.sqrt(dx * dx + dy * dy), MAX_FLICK_POWER * 4)
        
        ctx.strokeStyle = `rgba(59, 130, 246, ${0.3 + power / 200})`
        ctx.lineWidth = 3
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.moveTo(state.playerPen.x, state.playerPen.y)
        ctx.lineTo(state.playerPen.x + dx, state.playerPen.y + dy)
        ctx.stroke()
        ctx.setLineDash([])

        // Draw power indicator
        const normalizedPower = power / (MAX_FLICK_POWER * 4)
        ctx.fillStyle = `hsl(${120 - normalizedPower * 120}, 80%, 50%)`
        ctx.beginPath()
        ctx.arc(state.playerPen.x + dx, state.playerPen.y + dy, 8 + normalizedPower * 8, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const drawPen = (ctx: CanvasRenderingContext2D, pen: Pen) => {
      ctx.save()
      ctx.translate(pen.x, pen.y)
      ctx.rotate(pen.angle)

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
      ctx.fillStyle = "#silver"
      ctx.fillStyle = "#c0c0c0"
      ctx.fillRect(-pen.width / 2 - 12, -pen.height / 2 - 6, 3, pen.height + 8)

      // Shine effect
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)"
      ctx.fillRect(-pen.width / 2 + 5, -pen.height / 2 + 2, pen.width - 20, 3)

      ctx.restore()
    }

    gameLoop()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, []) // Empty dependency - game loop runs continuously

  // AI turn trigger - use ref to track if AI has taken turn
  const aiTurnScheduledRef = useRef(false)
  
  useEffect(() => {
    // Reset scheduled flag when it becomes player's turn
    if (gameState.isPlayerTurn) {
      aiTurnScheduledRef.current = false
      return
    }
    
    // If it's AI's turn, not game over, not round over, and we haven't scheduled yet
    if (!gameState.isPlayerTurn && !gameState.gameOver && !gameState.roundOver && !aiTurnScheduledRef.current) {
      const pensMoving = arePensMoving(gameState.playerPen, gameState.aiPen)
      
      if (!pensMoving) {
        aiTurnScheduledRef.current = true
        const timeout = setTimeout(() => {
          aiTurn()
        }, 800)
        return () => clearTimeout(timeout)
      }
    }
  }, [gameState.isPlayerTurn, gameState.gameOver, gameState.roundOver, aiTurn, gameState.playerPen.vx, gameState.playerPen.vy, gameState.aiPen.vx, gameState.aiPen.vy])

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
    if (!gameState.isPlayerTurn || gameState.gameOver || gameState.roundOver) return
    if (arePensMoving(gameState.playerPen, gameState.aiPen)) return

    const pos = getMousePos(e)
    if (isNearPen(pos, gameState.playerPen)) {
      setShowInstructions(false)
      setGameState((prev) => ({
        ...prev,
        isDragging: true,
        dragStart: pos,
        dragEnd: pos,
      }))
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!gameState.isDragging) return
    const pos = getMousePos(e)
    setGameState((prev) => ({
      ...prev,
      dragEnd: pos,
    }))
  }

  const handleMouseUp = () => {
    if (!gameState.isDragging || !gameState.dragStart || !gameState.dragEnd) return

    const dx = gameState.dragStart.x - gameState.dragEnd.x
    const dy = gameState.dragStart.y - gameState.dragEnd.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    if (distance > 10) {
      const power = Math.min(distance / 4, MAX_FLICK_POWER)
      const angle = Math.atan2(dy, dx)

      setGameState((prev) => ({
        ...prev,
        playerPen: {
          ...prev.playerPen,
          vx: Math.cos(angle) * power,
          vy: Math.sin(angle) * power,
        },
        isDragging: false,
        dragStart: null,
        dragEnd: null,
        isPlayerTurn: false,
      }))
    } else {
      setGameState((prev) => ({
        ...prev,
        isDragging: false,
        dragStart: null,
        dragEnd: null,
      }))
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Score display */}
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-3 bg-primary/10 px-6 py-3 rounded-xl">
          <div className="w-4 h-4 rounded-full bg-primary" />
          <span className="font-bold text-lg text-foreground">You: {gameState.playerScore}</span>
        </div>
        <div className="text-2xl font-bold text-muted-foreground">VS</div>
        <div className="flex items-center gap-3 bg-destructive/10 px-6 py-3 rounded-xl">
          <div className="w-4 h-4 rounded-full bg-destructive" />
          <span className="font-bold text-lg text-foreground">AI: {gameState.aiScore}</span>
        </div>
      </div>

      {/* Turn indicator */}
      <div className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
        gameState.isPlayerTurn 
          ? "bg-primary text-primary-foreground" 
          : "bg-destructive text-destructive-foreground"
      }`}>
        {gameState.isPlayerTurn ? "Your Turn - Flick your pen!" : "AI is thinking..."}
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
        {showInstructions && (
          <div className="absolute inset-0 flex items-center justify-center bg-foreground/50 rounded-2xl">
            <div className="bg-card p-6 rounded-xl text-center shadow-xl max-w-xs">
              <h3 className="text-lg font-bold text-card-foreground mb-2">How to Play</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Click and drag on your <span className="text-primary font-bold">blue pen</span> to flick it! 
                Push the <span className="text-destructive font-bold">red pen</span> off the table to score. 
                First to 3 wins!
              </p>
              <Button onClick={() => setShowInstructions(false)}>Got it!</Button>
            </div>
          </div>
        )}

        {/* Round over overlay */}
        {gameState.roundOver && !gameState.gameOver && (
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
        {gameState.gameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-foreground/50 rounded-2xl">
            <div className="bg-card p-8 rounded-xl text-center shadow-xl">
              {gameState.winner === "player" ? (
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
