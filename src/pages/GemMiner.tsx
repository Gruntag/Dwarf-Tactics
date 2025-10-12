import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Diamond, Pickaxe, Users, Zap, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

interface Upgrade {
  id: string;
  name: string;
  description: string;
  baseCost: number;
  level: number;
  multiplier: number;
  icon: typeof Pickaxe;
}

const GemMiner = () => {
  const navigate = useNavigate();
  const [gems, setGems] = useState(0);
  const [totalGemsEarned, setTotalGemsEarned] = useState(0);
  const [clickPower, setClickPower] = useState(1);
  const [gemsPerSecond, setGemsPerSecond] = useState(0);

  const [upgrades, setUpgrades] = useState<Upgrade[]>([
    { id: "click1", name: "Sharper Pickaxe", description: "+1 gem/click", baseCost: 10, level: 0, multiplier: 1.15, icon: Pickaxe },
    { id: "auto1", name: "Goblin Miner", description: "+1 gem/sec", baseCost: 50, level: 0, multiplier: 1.2, icon: Users },
    { id: "click2", name: "Iron Pickaxe", description: "+2 gems/click", baseCost: 100, level: 0, multiplier: 1.15, icon: Pickaxe },
    { id: "auto2", name: "Dwarf Foreman", description: "+5 gems/sec", baseCost: 500, level: 0, multiplier: 1.25, icon: Zap },
    { id: "click3", name: "Steel Pickaxe", description: "+5 gems/click", baseCost: 1000, level: 0, multiplier: 1.15, icon: Pickaxe },
    { id: "auto3", name: "Dark Enchantment", description: "+25 gems/sec", baseCost: 5000, level: 0, multiplier: 1.3, icon: TrendingUp },
    { id: "click4", name: "Mithril Pickaxe", description: "+10 gems/click", baseCost: 10000, level: 0, multiplier: 1.15, icon: Pickaxe },
    { id: "auto4", name: "Skeleton Crew", description: "+50 gems/sec", baseCost: 25000, level: 0, multiplier: 1.3, icon: Users },
    { id: "click5", name: "Obsidian Pickaxe", description: "+25 gems/click", baseCost: 50000, level: 0, multiplier: 1.15, icon: Pickaxe },
    { id: "auto5", name: "Shadow Miners", description: "+100 gems/sec", baseCost: 100000, level: 0, multiplier: 1.35, icon: Zap },
    { id: "click6", name: "Cursed Pickaxe", description: "+50 gems/click", baseCost: 250000, level: 0, multiplier: 1.15, icon: Pickaxe },
    { id: "auto6", name: "Necromancer", description: "+250 gems/sec", baseCost: 500000, level: 0, multiplier: 1.35, icon: TrendingUp },
    { id: "click7", name: "Dragon Pickaxe", description: "+100 gems/click", baseCost: 1000000, level: 0, multiplier: 1.15, icon: Pickaxe },
    { id: "auto7", name: "Dark Portal", description: "+500 gems/sec", baseCost: 2500000, level: 0, multiplier: 1.4, icon: Users },
    { id: "click8", name: "Demon Pickaxe", description: "+250 gems/click", baseCost: 5000000, level: 0, multiplier: 1.15, icon: Pickaxe },
    { id: "auto8", name: "Lich King", description: "+1000 gems/sec", baseCost: 10000000, level: 0, multiplier: 1.4, icon: Zap },
    { id: "click9", name: "Void Pickaxe", description: "+500 gems/click", baseCost: 25000000, level: 0, multiplier: 1.15, icon: Pickaxe },
    { id: "auto9", name: "Abyssal Mine", description: "+2500 gems/sec", baseCost: 50000000, level: 0, multiplier: 1.45, icon: TrendingUp },
    { id: "click10", name: "Cosmic Pickaxe", description: "+1000 gems/click", baseCost: 100000000, level: 0, multiplier: 1.15, icon: Pickaxe },
    { id: "auto10", name: "Demon Army", description: "+5000 gems/sec", baseCost: 250000000, level: 0, multiplier: 1.45, icon: Users },
    { id: "click11", name: "Eldritch Pickaxe", description: "+2500 gems/click", baseCost: 500000000, level: 0, multiplier: 1.15, icon: Pickaxe },
    { id: "auto11", name: "Void Rift", description: "+10000 gems/sec", baseCost: 1000000000, level: 0, multiplier: 1.5, icon: Zap },
    { id: "click12", name: "Godslayer Pickaxe", description: "+5000 gems/click", baseCost: 2500000000, level: 0, multiplier: 1.15, icon: Pickaxe },
    { id: "auto12", name: "Apocalypse", description: "+25000 gems/sec", baseCost: 5000000000, level: 0, multiplier: 1.5, icon: TrendingUp },
    { id: "final", name: "Eternal Darkness", description: "+100000 gems/sec", baseCost: 10000000000, level: 0, multiplier: 1.6, icon: Diamond },
  ]);

  // Calculate cost for upgrade
  const getUpgradeCost = (upgrade: Upgrade) => {
    return Math.floor(upgrade.baseCost * Math.pow(upgrade.multiplier, upgrade.level));
  };

  // Handle manual mining
  const handleMine = useCallback(() => {
    setGems((prev) => prev + clickPower);
    setTotalGemsEarned((prev) => prev + clickPower);
  }, [clickPower]);

  // Handle upgrade purchase
  const handleUpgrade = (upgradeId: string) => {
    const upgrade = upgrades.find((u) => u.id === upgradeId);
    if (!upgrade) return;

    const cost = getUpgradeCost(upgrade);
    if (gems >= cost) {
      setGems((prev) => prev - cost);
      setUpgrades((prev) =>
        prev.map((u) => {
          if (u.id === upgradeId) {
            const newLevel = u.level + 1;
            
            // Update click power or auto-mining based on description
            if (u.id.startsWith("click")) {
              const powerMatch = u.description.match(/\+(\d+)/);
              if (powerMatch) {
                setClickPower((prev) => prev + parseInt(powerMatch[1]));
              }
            } else if (u.id.startsWith("auto") || u.id === "final") {
              const powerMatch = u.description.match(/\+(\d+)/);
              if (powerMatch) {
                setGemsPerSecond((prev) => prev + parseInt(powerMatch[1]));
              }
            }

            toast({
              title: "Upgrade Purchased!",
              description: `${u.name} level ${newLevel}`,
            });

            return { ...u, level: newLevel };
          }
          return u;
        })
      );
    } else {
      toast({
        title: "Not Enough Gems",
        description: `You need ${cost - gems} more gems`,
        variant: "destructive",
      });
    }
  };

  // Auto-mining effect
  useEffect(() => {
    if (gemsPerSecond > 0) {
      const interval = setInterval(() => {
        setGems((prev) => prev + gemsPerSecond / 10);
        setTotalGemsEarned((prev) => prev + gemsPerSecond / 10);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [gemsPerSecond]);


  return (
    <div className="min-h-screen bg-[var(--gradient-game)] p-4 md:p-8 relative overflow-hidden">
      {/* Dark ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
      
      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Button
            variant="outline"
            size="lg"
            onClick={() => navigate("/")}
            className="group"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            Back to Menu
          </Button>
          
          <div className="text-right">
            <h1 className="text-4xl md:text-6xl font-black text-foreground tracking-tight">
              GEM MINER
            </h1>
            <p className="text-muted-foreground mt-1">Dark Fantasy Idle Mining</p>
          </div>
        </div>

        {/* Stats Bar */}
        <Card className="bg-card/80 backdrop-blur border-border/50 p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-muted-foreground text-sm mb-1">Current Gems</p>
              <p className="text-3xl font-bold text-primary">
                <Diamond className="inline w-6 h-6 mb-1 mr-2" />
                {Math.floor(gems).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm mb-1">Per Second</p>
              <p className="text-3xl font-bold text-accent">
                {gemsPerSecond.toFixed(1)}/s
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm mb-1">Total Mined</p>
              <p className="text-3xl font-bold text-foreground">
                {Math.floor(totalGemsEarned).toLocaleString()}
              </p>
            </div>
          </div>
        </Card>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Mining Area */}
          <Card className="bg-card/80 backdrop-blur border-border/50 p-8 flex flex-col items-center justify-center min-h-[400px]">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-2">Mine the Depths</h2>
              <p className="text-muted-foreground">Click to extract gems from the dark caverns</p>
            </div>

            <button
              onClick={handleMine}
              className="relative group mb-8"
            >
              <div className="absolute -inset-4 bg-gradient-to-r from-primary via-accent to-primary rounded-full blur-xl opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative bg-card/90 rounded-full p-12 border-4 border-primary/50 group-hover:border-primary group-hover:scale-105 transition-all duration-300">
                <Diamond className="w-24 h-24 text-primary group-hover:text-accent transition-colors duration-300" />
              </div>
            </button>
            
            <div className="mt-8 text-center">
              <p className="text-xl font-semibold text-foreground">
                <Pickaxe className="inline w-5 h-5 mr-2" />
                {clickPower} gems per click
              </p>
            </div>
          </Card>

          {/* Upgrades Area */}
          <Card className="bg-card/80 backdrop-blur border-border/50 p-8">
            <h2 className="text-2xl font-bold text-foreground mb-6">Dark Upgrades</h2>
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {upgrades.map((upgrade, index) => {
                const Icon = upgrade.icon;
                const cost = getUpgradeCost(upgrade);
                const canAfford = gems >= cost;
                const previousUpgrade = index > 0 ? upgrades[index - 1] : null;
                const isUnlocked = !previousUpgrade || previousUpgrade.level > 0;

                if (!isUnlocked) return null;

                return (
                  <Card
                    key={upgrade.id}
                    className="bg-card/60 border-border/50 p-4 hover:bg-card/80 transition-all duration-300"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="bg-primary/20 p-2 rounded-lg">
                          <Icon className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-bold text-foreground">{upgrade.name}</h3>
                          <p className="text-sm text-muted-foreground">{upgrade.description}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Level {upgrade.level}</p>
                      </div>
                    </div>
                    
                    <Button
                      onClick={() => handleUpgrade(upgrade.id)}
                      disabled={!canAfford}
                      className="w-full mt-2"
                      variant={canAfford ? "default" : "outline"}
                    >
                      <Diamond className="w-4 h-4 mr-2" />
                      Buy for {cost.toLocaleString()}
                    </Button>
                  </Card>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default GemMiner;
