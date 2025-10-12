import { Button } from "@/components/ui/button";
import { Gamepad2, Sword, Shield, Hammer, Trophy, Coins, Skull, Flame, Crown, Diamond } from "lucide-react";
import { useNavigate } from "react-router-dom";
import gruntagDwarf from "@/assets/gruntag-dwarf.jpg";

const Index = () => {
  const navigate = useNavigate();
  const minigames = [
    { name: "Battle Arena", icon: Sword, path: "/battle-arena" },
    { name: "Shield Defense", icon: Shield, path: "/shield-defense" },
    { name: "Forge Master", icon: Hammer, path: "/forge-master" },
    { name: "Trophy Hunt", icon: Trophy, path: "/trophy-hunt" },
    { name: "Gold Rush", icon: Coins, path: "/gold-rush" },
    { name: "Skull Crusher", icon: Skull, path: "/skull-crusher" },
    { name: "Dragon Fire", icon: Flame, path: "/dragon-fire" },
    { name: "Mountain King", icon: Crown, path: "/mountain-king" },
    { name: "Gem Miner", icon: Diamond, path: "/gem-miner" },
    { name: "Warrior's Challenge", icon: Gamepad2, path: "/warriors-challenge" },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background gradient overlay */}
      <div className="absolute inset-0 bg-[var(--gradient-hero)] z-0" />
      
      {/* Animated glow effect */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/20 rounded-full blur-[100px] animate-pulse z-0" />
      
      <main className="relative z-10 max-w-6xl w-full">
        {/* Hero Section */}
        <div className="text-center mb-12 space-y-6">
          <h1 className="text-6xl md:text-8xl font-black tracking-tight mb-4 bg-gradient-to-r from-foreground via-primary to-accent bg-clip-text text-transparent drop-shadow-2xl">
            GRUNTAG
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground font-semibold tracking-wide">
            THE LEGENDARY DWARF
          </p>
        </div>

        {/* Minigames Section */}
        <div className="space-y-8">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-foreground tracking-wide mb-12">
            CHOOSE YOUR CHALLENGE
          </h2>
          
          <div className="flex flex-col lg:flex-row items-center justify-center gap-8">
            {/* Left Buttons */}
            <div className="flex flex-col gap-4 w-full lg:w-64">
              {minigames.slice(0, 5).map((game) => {
                const Icon = game.icon;
                return (
                  <Button
                    key={game.name}
                    variant="game"
                    size="lg"
                    className="h-16 text-lg group"
                    onClick={() => game.path && navigate(game.path)}
                  >
                    <Icon className="w-6 h-6 group-hover:scale-110 transition-transform duration-300" />
                    {game.name}
                  </Button>
                );
              })}
            </div>

            {/* Dwarf Image */}
            <div className="relative group flex-shrink-0">
              <div className="absolute -inset-2 bg-gradient-to-r from-primary via-accent to-primary rounded-lg blur-xl opacity-75 group-hover:opacity-100 transition-opacity duration-500" />
              <img
                src={gruntagDwarf}
                alt="Gruntag the Angry Dwarf"
                className="relative rounded-lg w-full max-w-md lg:max-w-lg shadow-[var(--shadow-game)] border-4 border-primary/50 group-hover:border-primary transition-all duration-300"
              />
            </div>

            {/* Right Buttons */}
            <div className="flex flex-col gap-4 w-full lg:w-64">
              {minigames.slice(5, 10).map((game) => {
                const Icon = game.icon;
                return (
                  <Button
                    key={game.name}
                    variant="game"
                    size="lg"
                    className="h-16 text-lg group"
                    onClick={() => game.path && navigate(game.path)}
                  >
                    <Icon className="w-6 h-6 group-hover:scale-110 transition-transform duration-300" />
                    {game.name}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-16 text-muted-foreground">
          <p className="text-sm tracking-widest">PREPARE FOR LEGENDARY BATTLES</p>
        </div>
      </main>
    </div>
  );
};

export default Index;
