import PenFightGame from "@/components/pen-fight-game"

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-3 text-balance">
          Pen Fight
        </h1>
        <p className="text-muted-foreground text-lg max-w-md mx-auto text-pretty">
          The classic school game, now digital! Flick your pen to knock out the opponent.
        </p>
      </div>
      
      <PenFightGame />
      
      <footer className="mt-8 text-center text-sm text-muted-foreground">
        <p>First to 3 points wins! Don&apos;t fall off the table!</p>
      </footer>
    </main>
  )
}
