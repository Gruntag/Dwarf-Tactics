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
  const [miningProgress, setMiningProgress] = useState(0);

  const [upgrades, setUpgrades] = useState<Upgrade[]>([
    {
      id: "click",
      name: "Sharper Pickaxe",
      description: "Increase gems per click",
      baseCost: 10,
      level: 0,
      multiplier: 1.15,
      icon: Pickaxe,
    },
    {
      id: "auto1",
      name: "Goblin Miner",
      description: "+1 gem/sec",
      baseCost: 50,
      level: 0,
      multiplier: 1.2,
      icon: Users,
    },
    {
      id: "auto2",
      name: "Dwarf Foreman",
      description: "+5 gems/sec",
      baseCost: 500,
      level: 0,
      multiplier: 1.25,
      icon: Zap,
    },
    {
      id: "auto3",
      name: "Dark Enchantment",
      description: "+25 gems/sec",
      baseCost: 5000,
      level: 0,
      multiplier: 1.3,
      icon: TrendingUp,
    },
  ]);

  // Calculate cost for upgrade
  const getUpgradeCost = (upgrade: Upgrade) => {
    return Math.floor(upgrade.baseCost * Math.pow(upgrade.multiplier, upgrade.level));
  };

  // Handle manual mining
  const handleMine = useCallback(() => {
    setGems((prev) => prev + clickPower);
    setTotalGemsEarned((prev) => prev + clickPower);
    setMiningProgress(100);
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
            
            // Update click power or auto-mining
            if (u.id === "click") {
              setClickPower((prev) => prev + 1);
            } else if (u.id === "auto1") {
              setGemsPerSecond((prev) => prev + 1);
            } else if (u.id === "auto2") {
              setGemsPerSecond((prev) => prev + 5);
            } else if (u.id === "auto3") {
              setGemsPerSecond((prev) => prev + 25);
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

  // Mining progress animation
  useEffect(() => {
    if (miningProgress > 0) {
      const timeout = setTimeout(() => {
        setMiningProgress(0);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [miningProgress]);

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

            <Progress value={miningProgress} className="w-full max-w-md h-3" />
            
            <div className="mt-6 text-center">
              <p className="text-xl font-semibold text-foreground">
                <Pickaxe className="inline w-5 h-5 mr-2" />
                {clickPower} gems per click
              </p>
            </div>
          </Card>

          {/* Upgrades Area */}
          <Card className="bg-card/80 backdrop-blur border-border/50 p-8">
            <h2 className="text-2xl font-bold text-foreground mb-6">Dark Upgrades</h2>
            <div className="space-y-4">
              {upgrades.map((upgrade) => {
                const Icon = upgrade.icon;
                const cost = getUpgradeCost(upgrade);
                const canAfford = gems >= cost;

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
