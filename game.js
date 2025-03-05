// Game class to manage core state and flow
class Game {
  constructor() {
    this.state = {
      round: 1,
      mana: 100,
      maxMana: 100,
      manaRegen: 3, // 3 mana/second for early rounds
      roundTime: 10, // Start at 10 seconds
      inRound: true,
      gameStarted: false,
      spellSelected: false,
      gameEnded: false,
      updateInterval: null,
      lastUpdate: Date.now(),
      lastGlobalLog: Date.now(),
      postRound: false // New flag to track post-round state
    };
    this.spellManager = new SpellManager(this);
    this.targetManager = new TargetManager(this);
    this.uiManager = new UIManager(this, this.spellManager, this.targetManager);
    this.leaderboardManager = new LeaderboardManager(this.uiManager);
    this.objective = null; // Placeholder for round-specific objectives
  }

  async start() {
    console.log("Starting game...");
    this.state.gameStarted = true;
    this.state.gameEnded = false;
    this.state.inRound = true; // Ensure inRound is true
    this.state.roundTime = 10; // Fresh timer for Round 1
    this.state.lastUpdate = Date.now();
    this.state.lastGlobalLog = Date.now();

    // Explicitly toggle visibility of startScreen and gameContent
    const startScreen = document.getElementById("startScreen");
    const gameContent = document.getElementById("gameContent");
    if (startScreen && gameContent) {
      console.log("Before toggle: startScreen display =", startScreen.style.display, ", gameContent display =", gameContent.style.display);
      startScreen.style.display = "none";
      gameContent.style.display = "block";
      console.log("After toggle: startScreen display =", startScreen.style.display, ", gameContent display =", gameContent.style.display);
    } else {
      console.error("Failed to find startScreen or gameContent elements");
    }

    // Ensure the game loop starts
    if (!this.state.updateInterval) {
      this.state.updateInterval = setInterval(() => this.update(), 100);
      console.log("Game loop started");
    } else {
      console.log("Game loop already running");
    }

    // Force UI update with requestAnimationFrame to ensure rendering
    requestAnimationFrame(() => {
      this.uiManager.update();
      console.log("Forced UI update with requestAnimationFrame");
    });
  }

  async reset() {
  console.log("Resetting game state...");
  this.state.round = 1;
  this.state.mana = 100;
  this.state.maxMana = 100;
  this.state.manaRegen = 3;
  this.state.roundTime = 10;
  this.state.inRound = true;
  this.state.gameStarted = false;
  this.state.spellSelected = false;
  this.state.gameEnded = false;
  this.state.postRound = false; // Reset postRound
  this.state.lastUpdate = Date.now();
  this.state.lastGlobalLog = Date.now();
  if (this.state.updateInterval) clearInterval(this.state.updateInterval);
  this.state.updateInterval = null;
  this.spellManager.reset();
  this.targetManager.reset();
  await this.leaderboardManager.load(); // Wait for leaderboard to load

  // Ensure startScreen is visible and gameContent is hidden
  const startScreen = document.getElementById("startScreen");
  const gameContent = document.getElementById("gameContent");
  if (startScreen && gameContent) {
    console.log("Resetting visibility: showing startScreen, hiding gameContent");
    startScreen.style.display = "flex";
    gameContent.style.display = "none";
  } else {
    console.error("Failed to find startScreen or gameContent elements during reset");
  }

  this.uiManager.update();
}

  nextRound() {
  console.log(`Starting Round ${this.state.round + 1}`);
  this.state.round++;
  this.state.roundTime = Math.min(30, 20 + Math.floor((this.state.round - 1) / 3));
  console.log(`Round ${this.state.round} timer set to ${this.state.roundTime} seconds`);
  this.state.inRound = true;
  this.state.postRound = false; // Reset postRound
  this.state.spellSelected = false;
  this.state.lastUpdate = Date.now();
  if (!this.state.updateInterval) {
    this.state.updateInterval = setInterval(() => this.update(), 100);
  }
  this.targetManager.generateTargets();
  this.setObjective();
  this.uiManager.update();
}

setObjective() {
  // Objective: Ensure no target dies (health > 0)
  this.objective = {
    description: "Ensure no target dies",
    check: () => {
      const result = !this.targetManager.checkLossCondition();
      console.log(`Objective check result: ${result}`);
      return result;
    }
  };
}

update() {
  if (!this.state.gameStarted || this.state.gameEnded || !this.state.inRound) return;

  const now = Date.now();
  const timePassed = (now - this.state.lastUpdate) / 1000;

  this.state.mana = Math.min(this.state.maxMana, this.state.mana + this.state.manaRegen * timePassed);
  this.state.roundTime -= timePassed;

  // Update targets (apply damage, healing, etc.)
  this.targetManager.updateTargets(timePassed);
  this.spellManager.updateCasting(timePassed);

  // Check if any target has died (immediate loss condition)
  if (this.targetManager.checkLossCondition()) {
    console.log("Target health reached 0, ending game...");
    this.endGame("defeat");
    return;
  }

  // Check if the round has ended (timer <= 0)
  if (this.state.roundTime <= 0) {
    // Log the exact state when the round ends
    console.log(`Round ended. Target health: ${this.targetManager.targets.map(t => t.health.toFixed(2)).join(", ")}`);
    // Since checkLossCondition() already handles the failure case, transition to post-round state
    console.log("Round completed successfully, entering post-round state...");
    this.state.inRound = false;
    this.state.postRound = true; // Enter post-round phase
    if (this.state.updateInterval) {
      clearInterval(this.state.updateInterval);
      this.state.updateInterval = null;
    }
  }

  // Periodic status log every 5 seconds
  if (now - this.state.lastGlobalLog >= 5000) {
    console.log(`Game Status: Round ${this.state.round}, Time: ${Math.ceil(this.state.roundTime)}s, Mana: ${Math.floor(this.state.mana)}/${this.state.maxMana}, Regen: ${this.state.manaRegen.toFixed(1)}/s, Targets: ${this.targetManager.targets.map(t => Math.floor(t.health)).join(", ")}`);
    this.state.lastGlobalLog = now;
  }

  this.state.lastUpdate = now;
  this.uiManager.update();
}

  endGame(result) {
    console.log(`Game ended: ${result}, reached Round ${this.state.round}`);
    this.state.gameEnded = true;
    if (this.state.updateInterval) {
      clearInterval(this.state.updateInterval);
      this.state.updateInterval = null;
    }
    this.leaderboardManager.save(result);
    this.uiManager.update();
  }
}

// SpellManager class to handle spells and casting
class SpellManager {
  constructor(game) {
    this.game = game;
    this.spells = {
      lesserHeal: { enabled: true, castTime: 2, manaCost: 10, healAmount: 20 },
      heal: { enabled: false, castTime: 2.5, manaCost: 20, healAmount: 30 },
      flashHeal: { enabled: false, castTime: 1, manaCost: 15, healAmount: 40 },
      renew: { enabled: false, castTime: 0, manaCost: 25, healAmount: 50, duration: 10 }
    };
    this.casting = false;
    this.castProgress = 0;
    this.castDuration = 0;
    this.castTargetIndex = -1;
    this.castSpellType = "";
  }

  reset() {
    this.spells = {
      lesserHeal: { enabled: true, castTime: 2, manaCost: 10, healAmount: 20 },
      heal: { enabled: false, castTime: 2.5, manaCost: 20, healAmount: 30 },
      flashHeal: { enabled: false, castTime: 1, manaCost: 15, healAmount: 40 },
      renew: { enabled: false, castTime: 0, manaCost: 25, healAmount: 50, duration: 10 }
    };
    this.casting = false;
    this.castProgress = 0;
    this.castDuration = 0;
    this.castTargetIndex = -1;
    this.castSpellType = "";
  }

  cast(event, targetIndex) {
    if (!this.game.state.gameStarted || this.game.state.gameEnded || this.casting) {
      console.log("Cannot cast: game not active or already casting");
      return;
    }
    event.preventDefault();
    const target = this.game.targetManager.targets[targetIndex];

    let spellType = "";
    if (event.button === 0) {
      spellType = event.shiftKey && this.spells.renew.enabled ? "renew" : this.spells.heal.enabled ? "heal" : "lesserHeal";
    } else if (event.button === 2 && this.spells.flashHeal.enabled) {
      spellType = "flashHeal";
    } else {
      console.log("Spell cast failed: invalid input or spell not enabled");
      return;
    }

    const spell = this.spells[spellType];
    if (this.game.state.mana < spell.manaCost) {
      console.log("Spell cast failed: not enough mana");
      return;
    }
    if (target.health >= target.maxHealth && spellType !== "renew") {
      console.log("Spell cast failed: target at full health");
      return;
    }

    this.game.state.mana -= spell.manaCost;
    console.log(`Casting ${spellType} on target ${targetIndex}`);

    if (spellType === "renew") {
      target.renewTime = spell.duration;
      console.log(`Renew applied to target ${targetIndex} for ${spell.duration}s`);
    } else if (spell.castTime === 0) {
      target.health = Math.min(target.maxHealth, target.health + spell.healAmount);
      console.log(`${spellType} healed target ${targetIndex} for ${spell.healAmount}`);
    } else {
      this.castTargetIndex = targetIndex;
      this.castSpellType = spellType;
      this.castDuration = spell.castTime;
      this.castProgress = 0;
      this.casting = true;
    }
    this.game.uiManager.update();
  }

  updateCasting(timePassed) {
    if (!this.casting) return;
    this.castProgress += timePassed;
    if (this.castProgress >= this.castDuration) {
      const target = this.game.targetManager.targets[this.castTargetIndex];
      const spell = this.spells[this.castSpellType];
      console.log(`Completed cast of ${this.castSpellType} on target ${this.castTargetIndex}`);
      target.health = Math.min(target.maxHealth, target.health + spell.healAmount);
      this.casting = false;
      this.castProgress = 0;
      this.castDuration = 0;
      this.castTargetIndex = -1;
      this.castSpellType = "";
    }
  }

  unlock(spell) {
    console.log(`Unlocking spell: ${spell}`);
    if (spell === "heal") {
      this.spells.lesserHeal.enabled = false;
      this.spells.heal.enabled = true;
    } else {
      this.spells[spell].enabled = true;
    }
    this.game.state.spellSelected = true;
    this.game.uiManager.debouncedUpdate();
  }
}

// TargetManager class to handle targets, scaling, and modifiers
class TargetManager {
  constructor(game) {
    this.game = game;
    this.targets = [{ health: 75, maxHealth: 100, damageRate: 2, renewTime: 0 }];
    this.modifiers = {
      highDamage: {
        message: "High Damage Round!",
        applyEffect: (targets) => {
          console.log("Applying High Damage Modifier: Targets take 20% more damage.");
          targets.forEach(target => target.damageRate *= 1.2);
        }
      },
      extraTank: {
        message: "Extra Tank Round!",
        applyEffect: (targets) => {
          console.log("Applying Extra Tank Modifier: Adding a tank.");
          targets.push({ health: 100, maxHealth: 100, damageRate: 3, renewTime: 0 });
        }
      },
      criticalCondition: {
        message: "Critical Condition Round!",
        applyEffect: (targets) => {
          console.log("Applying Critical Condition Modifier: One target starts at 10 HP.");
          const targetIndex = Math.floor(Math.random() * targets.length);
          if (targets[targetIndex]) targets[targetIndex].health = 10;
        }
      }
    };
  }

  reset() {
    this.targets = [{ health: 75, maxHealth: 100, damageRate: 2, renewTime: 0 }];
  }

  generateTargets() {
    this.targets = [];
    const round = this.game.state.round;

    if (round === 1) {
      this.targets = [{ health: 60, maxHealth: 100, damageRate: 4, renewTime: 0 }];
      this.game.state.roundTime = 10;
    } else if (round === 2) {
      this.targets = [
        { health: 80, maxHealth: 100, damageRate: 2, renewTime: 0 },
        { health: 80, maxHealth: 100, damageRate: 2, renewTime: 0 }
      ];
    } else if (round === 3) {
      this.targets = [
        { health: 90, maxHealth: 100, damageRate: 2, renewTime: 0 },
        { health: 90, maxHealth: 100, damageRate: 2, renewTime: 0 },
        { health: 90, maxHealth: 100, damageRate: 3, renewTime: 0 }
      ];
    } else if (round === 4) {
      this.targets = [
        { health: 95, maxHealth: 100, damageRate: 2.5, renewTime: 0 },
        { health: 95, maxHealth: 100, damageRate: 2.5, renewTime: 0 },
        { health: 95, maxHealth: 100, damageRate: 2.5, renewTime: 0 },
        { health: 95, maxHealth: 100, damageRate: 2.5, renewTime: 0 }
      ];
    } else if (round === 5) {
      this.targets = [
        { health: 30, maxHealth: 100, damageRate: 4, renewTime: 0 },
        { health: 50, maxHealth: 100, damageRate: 2, renewTime: 0 },
        { health: 50, maxHealth: 100, damageRate: 2, renewTime: 0 }
      ];
    } else {
      const roundsPastFive = round - 5;
      const baseNumTargets = 3 + Math.floor(roundsPastFive / (round <= 9 ? 3 : 5));
      const variance = round <= 9 ? Math.floor(Math.random() * 5) - 2 : Math.floor(Math.random() * 3) - 1;
      const numTargets = Math.min(7, Math.max(3, baseNumTargets + variance));

      const tankDamageRate = 4 + 0.5 * roundsPastFive;
      const dpsDamageRate = 2 + 0.3 * roundsPastFive;
      const healerDamageRate = 1 + 0.2 * roundsPastFive;
      const baseHealth = Math.max(30, 100 - 2 * roundsPastFive);

      this.game.state.maxMana = 100 + 10 * Math.floor((round - 1) / 3);
      this.game.state.mana = Math.min(this.game.state.maxMana, this.game.state.mana + this.game.state.maxMana * 0.5);
      if (round % 5 === 0 && round > 5) {
        this.game.state.manaRegen += 0.2;
        console.log(`Scaling Applied: Max Mana increased to ${this.game.state.maxMana}, Mana Regen increased to ${this.game.state.manaRegen.toFixed(1)}`);
      }

      let appliedModifier = false;
      if (Math.random() < 0.5) {
        const availableModifiers = Object.keys(this.modifiers);
        const selectedKey = availableModifiers[Math.floor(Math.random() * availableModifiers.length)];
        const modifier = this.modifiers[selectedKey];
        console.log(`Applying Modifier: ${modifier.message}`);
        this.game.uiManager.setModifierMessage(modifier.message, 5);
        modifier.applyEffect(this.targets);
        appliedModifier = true;
      }

      let addedExtraTank = false;
      for (let i = 0; i < numTargets; i++) {
        let damageRate = i === 0 ? tankDamageRate : dpsDamageRate;
        if (!addedExtraTank && appliedModifier && this.game.uiManager.modifierMessage.includes("Extra Tank")) {
          damageRate = tankDamageRate;
          addedExtraTank = true;
        }
        if (round >= 10 && i === numTargets - 1) damageRate = healerDamageRate;

        let health = baseHealth;
        if (round <= 9) {
          const healthVariance = (Math.random() * 0.2 - 0.1) * health;
          health = Math.max(30, Math.min(100, health + healthVariance));
        }
        if (appliedModifier && this.game.uiManager.modifierMessage.includes("Critical Condition") && Math.random() < 0.25) {
          health = 10;
        }

        this.targets.push({ health, maxHealth: 100, damageRate, renewTime: 0 });
      }
    }
  }

  updateTargets(timePassed) {
    this.targets.forEach((target, i) => {
      target.health = Math.max(0, target.health - target.damageRate * timePassed);
      if (target.renewTime > 0) {
        const healPerTick = this.game.spellManager.spells.renew.healAmount / this.game.spellManager.spells.renew.duration;
        target.health = Math.min(target.maxHealth, target.health + healPerTick * timePassed);
        target.renewTime = Math.max(0, target.renewTime - timePassed);
      }
      if (this.game.state.round >= 10 && i === this.targets.length - 1) {
        for (let j = 0; j < this.targets.length - 1; j++) {
          this.targets[j].health = Math.min(this.targets[j].maxHealth, this.targets[j].health + 1 * timePassed);
        }
      }
    });
  }

  checkLossCondition() {
    return this.targets.some(t => t.health <= 0);
  }
}

// UIManager class to handle UI updates
class UIManager {
  constructor(game, spellManager, targetManager) {
    this.game = game;
    this.spellManager = spellManager;
    this.targetManager = targetManager;
    this.modifierMessage = "";
    this.modifierMessageTimer = 0;
    this.debouncedUpdate = this.debounce(this.update.bind(this), 50);
  }

  debounce(func, wait) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  setModifierMessage(message, duration) {
    this.modifierMessage = message;
    this.modifierMessageTimer = duration;
  }

  update() {
    if (!this.game.state.gameStarted) return;

    const status = document.getElementById("status");
    if (status) {
      status.innerHTML = this.game.state.inRound
        ? `Round ${this.game.state.round} - Time: ${Math.ceil(this.game.state.roundTime)}s${this.game.objective ? ` - ${this.game.objective.description}` : ""}`
        : `Round ${this.game.state.round} Complete!`;
    }

    const manaFill = document.getElementById("manaFill");
    const manaText = document.getElementById("manaText");
    if (manaFill && manaText) {
      manaFill.style.width = `${(this.game.state.mana / this.game.state.maxMana) * 100}%`;
      manaText.innerHTML = `${Math.floor(this.game.state.mana)}/${this.game.state.maxMana}`;
    }

    const castBar = document.getElementById("castBar");
    const castFill = document.getElementById("castFill");
    const castText = document.getElementById("castText");
    if (castBar && castFill && castText) {
      if (this.spellManager.casting) {
        castBar.style.display = "block";
        const progressPercent = (this.spellManager.castProgress / this.spellManager.castDuration) * 100;
        castFill.style.width = `${progressPercent}%`;
        const remainingTime = Math.max(0, (this.spellManager.castDuration - this.spellManager.castProgress)).toFixed(1);
        castText.innerHTML = `Casting ${this.spellManager.castSpellType === "heal" ? "Heal" : this.spellManager.castSpellType === "lesserHeal" ? "Lesser Heal" : "Flash Heal"} (${remainingTime}s)...`;
      } else {
        castBar.style.display = "none";
      }
    }

    const eventMessageDiv = document.getElementById("eventMessage");
    if (eventMessageDiv) {
      eventMessageDiv.innerHTML = this.modifierMessage;
      if (this.modifierMessageTimer > 0) {
        this.modifierMessageTimer -= (Date.now() - this.game.state.lastUpdate) / 1000;
        if (this.modifierMessageTimer <= 0) this.modifierMessage = "";
      }
    }

    let healthBarsHTML = "";
    if (this.game.state.inRound) {
      this.targetManager.targets.forEach((target, i) => {
        healthBarsHTML += `
          <div class="health-bar" onmousedown="game.spellManager.cast(event, ${i})" oncontextmenu="return false;">
            <div class="health-fill" id="healthFill${i}" style="width: ${(target.health / target.maxHealth) * 100}%;"></div>
            <div class="health-text" id="healthText${i}">${Math.floor(target.health)}/${target.maxHealth}</div>
          </div>
        `;
      });
    }
    const healthBars = document.getElementById("healthBars");
    if (healthBars) healthBars.innerHTML = healthBarsHTML;

    const talents = document.getElementById("talents");
    if (talents) {
      if (this.game.state.postRound && !this.game.state.gameEnded) { // Show talent selection or "Next Round" button in post-round state
        let availableSpells = [];
        if (this.game.state.round < 5) {
          if (!this.spellManager.spells.flashHeal.enabled) availableSpells.push('<button onclick="game.spellManager.unlock(\'flashHeal\')">Flash Heal (15 Mana, +40 HP)</button>');
          if (!this.spellManager.spells.heal.enabled) availableSpells.push('<button onclick="game.spellManager.unlock(\'heal\')">Heal (20 Mana, +30 HP) - Replaces Lesser Heal</button>');
          if (!this.spellManager.spells.renew.enabled) availableSpells.push('<button onclick="game.spellManager.unlock(\'renew\')">Renew (25 Mana, +50 HP over 10s)</button>');
        }
        talents.innerHTML = availableSpells.length > 0 && !this.game.state.spellSelected
          ? `<p>Choose a new spell:</p>${availableSpells.join(" ")}`
          : `<p>Round ${this.game.state.round} Complete! Continue to the next challenge?</p><button onclick="game.nextRound()">Next Round</button>`;
      } else if (this.game.state.inRound) {
        talents.innerHTML = "";
      } else {
        talents.innerHTML = `<p>Game Over! You reached Round ${this.game.state.round}.</p><button onclick="game.reset()">Play Again</button>`;
      }
    }

    const instructions = document.getElementById("instructions");
    if (instructions) {
      const spellCost = this.spellManager.spells.heal.enabled ? this.spellManager.spells.heal.manaCost : this.spellManager.spells.lesserHeal.manaCost;
      instructions.innerHTML = `
        <p ${this.game.state.mana >= spellCost ? 'class="spell-available"' : 'class="spell-unavailable"'}>Left-click: ${this.spellManager.spells.heal.enabled ? 'Heal (30 HP, 20 Mana, 2.5s)' : 'Lesser Heal (20 HP, 10 Mana, 2s)'}</p>
        ${this.spellManager.spells.flashHeal.enabled ? `<p ${this.game.state.mana >= this.spellManager.spells.flashHeal.manaCost ? 'class="spell-available"' : 'class="spell-unavailable"'}>Right-click: Flash Heal (40 HP, 15 Mana, 1s)</p>` : ''}
        ${this.spellManager.spells.renew.enabled ? `<p ${this.game.state.mana >= this.spellManager.spells.renew.manaCost ? 'class="spell-available"' : 'class="spell-unavailable"'}>Shift + Left-click: Renew (50 HP over 10s, 25 Mana, Instant)</p>` : ''}
      `;
    }
  }
}

// LeaderboardManager class to handle leaderboard
class LeaderboardManager {
  constructor(uiManager) {
    this.uiManager = uiManager;
    this.leaderboard = [];
  }

  async load() {
    console.log("Loading leaderboard from server...");
    try {
      const response = await fetch("leaderboard.php?action=read");
      if (!response.ok) throw new Error(`Failed to load leaderboard: ${response.status} ${response.statusText}`);
      this.leaderboard = await response.json();
      this.leaderboard.sort((a, b) => b.round - a.round);
      this.leaderboard = this.leaderboard.slice(0, 10);
      console.log("Leaderboard loaded:", this.leaderboard);
    } catch (error) {
      console.error("Error loading leaderboard:", error.message);
      // Fallback to a default leaderboard if fetch fails
      this.leaderboard = [
        { name: "Fish", round: 20 },
        { name: "Marz", round: 18 },
        { name: "Cassie", round: 5 },
        { name: "Marz Marz", round: 5 },
        { name: "Gamebad", round: 4 }
      ];
      console.log("Using default leaderboard:", this.leaderboard);
    }
    this.display();
  }

  async save(result) {
    const playerName = prompt(`Game Over! You reached Round ${this.uiManager.game.state.round}! Enter your name for the leaderboard:`);
    if (playerName) {
      const trimmedName = playerName.trim().substring(0, 20);
      if (trimmedName) {
        this.leaderboard.push({ name: trimmedName, round: this.uiManager.game.state.round });
        console.log("Saving leaderboard to server:", this.leaderboard);
        try {
          const response = await fetch("leaderboard.php?action=write", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(this.leaderboard)
          });
          if (!response.ok) throw new Error("Failed to save leaderboard");
          console.log("Leaderboard saved successfully.");
        } catch (error) {
          console.error("Error saving leaderboard:", error);
        }
      }
    }
    this.display();
  }

  display() {
    const list = document.getElementById("leaderboardList");
    if (!list) {
      console.error("Leaderboard list element not found!");
      return;
    }
    list.innerHTML = this.leaderboard.length > 0
      ? this.leaderboard.map(entry => `<li>${entry.name}: Round ${entry.round}</li>`).join("")
      : "<li>No scores yet!</li>";
  }
}

// Instantiate the game
const game = new Game();

// DOM setup and debug controls
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded, calling reset...");
  game.reset();

  // Debug panel toggle
  document.addEventListener("keydown", (e) => {
    if (e.key === "F1") {
      const panel = document.getElementById("debugPanel");
      if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
    }
  });
});

window.onfocus = () => {
  if (game.state.inRound && game.state.gameStarted && !game.state.gameEnded) game.update();
};

// Debug functions
function addMana(amount) {
  game.state.mana = Math.min(game.state.maxMana, game.state.mana + amount);
  console.log(`Debug: Added ${amount} mana, now ${game.state.mana}`);
  game.uiManager.update();
}

function skipRound() {
  game.state.roundTime = 0;
  game.update();
}
