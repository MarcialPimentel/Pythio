// Game class to manage core state and flow
class Game {
  constructor() {
    this.state = {
      round: 1,
      roundTime: 10,
      inRound: true,
      gameStarted: false,
      spellSelected: false,
      spellSelectionRound: 0,
      gameEnded: false,
      updateInterval: null,
      lastUpdate: Date.now(),
      lastGlobalLog: Date.now(),
      postRound: false
    };
    this.manaManager = new ManaManager(this); // Single instance of ManaManager
    this.spellManager = new SpellManager(this);
    this.targetManager = new TargetManager(this);
    this.uiManager = new UIManager(this, this.spellManager, this.targetManager, this.manaManager); // Pass the same ManaManager instance
    this.leaderboardManager = new LeaderboardManager(this.uiManager);
    this.objective = null;
  }

  async start() {
    console.log("Starting game - Initial state:", this.state);
    this.state.gameStarted = true;
    this.state.gameEnded = false;
    this.state.inRound = true;
    this.state.roundTime = 10;
    this.state.lastUpdate = Date.now();
    this.state.lastGlobalLog = Date.now();
    console.log("Game state updated to start:", this.state);

    const startScreen = document.getElementById("startScreen");
    const gameContent = document.getElementById("gameContent");
    if (!startScreen || !gameContent) {
      console.error("Missing critical DOM elements:", { startScreen, gameContent });
      return;
    }
    console.log("Before UI toggle:", { startScreenDisplay: startScreen.style.display, gameContentDisplay: gameContent.style.display });
    startScreen.style.display = "none";
    gameContent.style.display = "block";
    console.log("After UI toggle:", { startScreenDisplay: startScreen.style.display, gameContentDisplay: gameContent.style.display });

    if (!this.state.updateInterval) {
      this.state.updateInterval = setInterval(() => this.update(), 100);
      console.log("Game loop started with interval ID:", this.state.updateInterval);
    }
    this.uiManager.update();
    console.log("UI update triggered");
  }

async reset() {
  console.log("Resetting game...");
  this.state.round = 1;
  this.state.roundTime = 10;
  this.state.inRound = true;
  this.state.gameStarted = false;
  this.state.spellSelected = false;
  this.state.spellSelectionRound = 0;
  this.state.gameEnded = false;
  this.state.postRound = false;
  if (this.state.updateInterval) clearInterval(this.state.updateInterval);
  this.state.updateInterval = null;
  this.manaManager.reset(); // Reset mana via ManaManager
  this.spellManager.reset();
  this.targetManager.reset();
  await this.leaderboardManager.load();

  const startScreen = document.getElementById("startScreen");
  const gameContent = document.getElementById("gameContent");
  if (startScreen && gameContent) {
    startScreen.style.display = "flex";
    gameContent.style.display = "none";
  }
  this.uiManager.checkDOMElements();
  this.uiManager.update();
}

nextRound() {
  console.log(`Starting Round ${this.state.round + 1}`);
  this.state.round++;
  this.state.roundTime = Math.min(30, 20 + Math.floor((this.state.round - 1) / 3));
  console.log(`Round ${this.state.round} timer set to ${this.state.roundTime} seconds`);
  
  // Ensure projected mana is applied
  if (this.manaManager.projectedMana === null || this.manaManager.projectedMaxMana === null) {
    console.warn("Recalculating projected mana as it was not set");
    this.manaManager.calculateProjectedMana(this.state.round);
  }
  this.manaManager.applyProjectedMana();
  
  this.state.inRound = true;
  this.state.postRound = false;
  if (this.state.round % 2 !== 0) {
    this.state.spellSelected = false;
  }
  this.state.lastUpdate = Date.now();
  this.spellManager.stopCasting();
  if (!this.state.updateInterval) {
    this.state.updateInterval = setInterval(() => this.update(), 100);
  }
  this.targetManager.generateTargets();
  this.uiManager.update();
}

update() {
  if (!this.state.gameStarted || this.state.gameEnded || !this.state.inRound) return;

  const now = Date.now();
  const timePassed = (now - this.state.lastUpdate) / 1000;

  this.manaManager.update(timePassed);
  this.state.roundTime -= timePassed;

  this.targetManager.updateTargets(timePassed);
  this.spellManager.updateCasting(timePassed);

  if (this.targetManager.checkLossCondition()) {
    console.log("Target health reached 0, ending game...");
    this.endGame("defeat");
    return;
  }

  if (this.state.roundTime <= 0) {
    console.log(`Round ended. Target health: ${this.targetManager.targets.map(t => t.health.toFixed(2)).join(", ")}`);
    console.log("Round completed successfully, entering post-round state...");
    this.manaManager.setEndOfRoundMana();
    this.state.inRound = false;
    this.state.postRound = true;
    this.spellManager.stopCasting(); // Stop any active casts
    if (this.state.updateInterval) {
      clearInterval(this.state.updateInterval);
      this.state.updateInterval = null;
    }
  }

  if (now - this.state.lastGlobalLog >= 5000) {
    console.log(`Game Status: Round ${this.state.round}, Time: ${Math.ceil(this.state.roundTime)}s, Mana: ${Math.floor(this.manaManager.getMana())}/${this.manaManager.getMaxMana()}, Regen: ${this.manaManager.manaRegen.toFixed(1)}/s, Targets: ${this.targetManager.targets.map(t => Math.floor(t.health)).join(", ")}`);
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

class ManaManager {
  constructor(game) {
    this.game = game;
    this.mana = 100;
    this.maxMana = 100;
    this.manaRegen = 3.0;
    this.projectedMana = null;
    this.projectedMaxMana = null;
    this.endOfRoundMana = null;
  }

  reset() {
    console.log("Resetting ManaManager...");
    this.mana = 100;
    this.maxMana = 100;
    this.manaRegen = 3.0;
    this.projectedMana = null;
    this.projectedMaxMana = null;
    this.endOfRoundMana = null;
  }

  update(timePassed) {
    if (this.game.state.inRound) {
      this.mana = Math.min(this.maxMana, this.mana + this.manaRegen * timePassed);
    }
  }

  calculateProjectedMana(nextRound) {
    this.projectedMaxMana = 100 + 10 * Math.floor((nextRound - 1) / 3);
    const baseMana = this.endOfRoundMana !== null ? this.endOfRoundMana : this.mana;
    this.projectedMana = Math.min(this.projectedMaxMana, baseMana + this.projectedMaxMana * 0.5);
    if (nextRound % 5 === 0 && nextRound > 5) {
      this.manaRegen += 0.2;
      console.log(`Mana Regen increased to ${this.manaRegen.toFixed(1)}`);
    }
    console.log(`Calculated projected mana for Round ${nextRound}: ${this.projectedMana}/${this.projectedMaxMana} (base mana: ${baseMana})`);
  }

  applyProjectedMana() {
    if (this.projectedMana !== null && this.projectedMaxMana !== null) {
      this.mana = this.projectedMana;
      this.maxMana = this.projectedMaxMana;
      console.log(`Applied projected mana: ${this.mana}/${this.maxMana}`);
      this.projectedMana = null;
      this.projectedMaxMana = null;
      this.endOfRoundMana = null;
    } else {
      console.warn("No projected mana values to apply");
    }
  }

  deductMana(amount) {
    if (this.mana >= amount) {
      this.mana -= amount;
      console.log(`Deducted ${amount} mana, now ${this.mana}/${this.maxMana}`);
      return true;
    }
    console.log("Not enough mana to deduct");
    return false;
  }

  addMana(amount) {
    this.mana = Math.min(this.maxMana, this.mana + amount);
    console.log(`Debug: Added ${amount} mana, now ${this.mana}`);
  }

  setEndOfRoundMana() {
    this.endOfRoundMana = this.mana;
    console.log(`Set end-of-round mana: ${this.endOfRoundMana}`);
  }

  getMana() {
    return this.mana;
  }

  getMaxMana() {
    return this.maxMana !== undefined ? this.maxMana : 100;
  }

  getProjectedMana() {
    return this.projectedMana !== null ? this.projectedMana : this.mana;
  }

  getProjectedMaxMana() {
    return this.projectedMaxMana !== null ? this.projectedMaxMana : (this.maxMana !== undefined ? this.maxMana : 100);
  }
}

class Spell {
  constructor({ name, enabled = false, castTime = 0, manaCost, healAmount = 0, shieldAmount = 0, duration = 0, secondaryHeal = 0 }) {
    this.name = name;
    this.enabled = enabled;
    this.castTime = castTime;
    this.manaCost = manaCost;
    this.healAmount = healAmount;
    this.shieldAmount = shieldAmount;
    this.duration = duration;
    this.secondaryHeal = secondaryHeal;
  }
}

class SpellManager {
  constructor(game) {
    this.game = game;
    this.manaManager = game.manaManager; // Use the same ManaManager instance from Game
    this.spellDefinitions = {
      lesserHeal: { name: "lesserHeal", enabled: true, castTime: 2, manaCost: 10, healAmount: 20 },
      heal: { name: "heal", enabled: false, castTime: 2.5, manaCost: 20, healAmount: 30 },
      flashHeal: { name: "flashHeal", enabled: false, castTime: 1, manaCost: 15, healAmount: 40 },
      renew: { name: "renew", enabled: false, castTime: 0, manaCost: 25, healAmount: 50, duration: 10 },
      greaterHeal: { name: "greaterHeal", enabled: false, castTime: 3, manaCost: 30, healAmount: 50 },
      chainHeal: { name: "chainHeal", enabled: false, castTime: 2, manaCost: 35, healAmount: 30, secondaryHeal: 15 },
      shield: { name: "shield", enabled: false, castTime: 0, manaCost: 20, shieldAmount: 30, duration: 5 }
    };
    this.spells = this.initializeSpells();
    this.casting = false;
    this.castProgress = 0;
    this.castDuration = 0;
    this.castTargetIndex = -1;
    this.castSpellType = "";
  }

  initializeSpells() {
    const spells = {};
    for (const [key, definition] of Object.entries(this.spellDefinitions)) {
      spells[key] = new Spell(definition);
    }
    return spells;
  }

  reset() {
    this.spells = this.initializeSpells();
    this.casting = false;
    this.castProgress = 0;
    this.castDuration = 0;
    this.castTargetIndex = -1;
    this.castSpellType = "";
  }

  stopCasting() {
    if (this.casting) {
      console.log(`Stopping cast of ${this.castSpellType} on target ${this.castTargetIndex} due to round end`);
      this.casting = false;
      this.castProgress = 0;
      this.castDuration = 0;
      this.castTargetIndex = -1;
      this.castSpellType = "";
    }
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
    if (event.ctrlKey && this.spells.chainHeal.enabled) spellType = "chainHeal";
    else if (event.altKey && this.spells.shield.enabled) spellType = "shield";
    else if (event.shiftKey && this.spells.renew.enabled) spellType = "renew";
    else spellType = this.spells.greaterHeal.enabled ? "greaterHeal" : this.spells.heal.enabled ? "heal" : "lesserHeal";
  } else if (event.button === 2 && this.spells.flashHeal.enabled) {
    spellType = "flashHeal";
  } else {
    console.log("Spell cast failed: invalid input or spell not enabled");
    return;
  }

  const spell = this.spells[spellType];
  if (this.game.manaManager.getMana() < spell.manaCost) {
    console.log("Spell cast failed: not enough mana");
    return;
  }
  if (target.health >= target.maxHealth && spellType !== "renew" && spellType !== "shield") {
    console.log("Spell cast failed: target at full health");
    return;
  }

  if (!this.game.manaManager.deductMana(spell.manaCost)) { // Use deductMana
    console.log("Spell cast failed: not enough mana (deduction failed)");
    return;
  }
  console.log(`Casting ${spellType} on target ${targetIndex}`);

  // Update UI immediately after deducting mana to reflect the new state
  this.game.uiManager.update();

  if (spellType === "renew") {
    target.renewTime = spell.duration;
    console.log(`Renew applied to target ${targetIndex} for ${spell.duration}s`);
  } else if (spellType === "shield") {
    target.shield = spell.shieldAmount;
    target.shieldTime = spell.duration;
    console.log(`Shield applied to target ${targetIndex} for ${spell.shieldAmount} HP, ${spell.duration}s`);
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

}

  updateCasting(timePassed) {
    if (!this.casting) return;
    this.castProgress += timePassed;
    if (this.castProgress >= this.castDuration) {
      const target = this.game.targetManager.targets[this.castTargetIndex];
      const spell = this.spells[this.castSpellType];
      console.log(`Completed cast of ${this.castSpellType} on target ${this.castTargetIndex}`);
      if (this.castSpellType === "chainHeal") {
        target.health = Math.min(target.maxHealth, target.health + spell.healAmount);
        console.log(`Chain Heal healed target ${this.castTargetIndex} for ${spell.healAmount}`);
        const nextIndex = (this.castTargetIndex + 1) % this.game.targetManager.targets.length;
        const nextTarget = this.game.targetManager.targets[nextIndex];
        if (nextTarget.health < nextTarget.maxHealth) {
          nextTarget.health = Math.min(nextTarget.maxHealth, nextTarget.health + spell.secondaryHeal);
          console.log(`Chain Heal healed adjacent target ${nextIndex} for ${spell.secondaryHeal}`);
        }
      } else {
        target.health = Math.min(target.maxHealth, target.health + spell.healAmount);
      }
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
    } else if (spell === "greaterHeal") {
      this.spells.heal.enabled = false;
      this.spells.greaterHeal.enabled = true;
    } else {
      this.spells[spell].enabled = true;
    }
    this.game.state.spellSelected = true;
    this.game.state.spellSelectionRound = this.game.state.round;
    this.game.uiManager.debouncedUpdate();
  }
}

class TargetManager {
  constructor(game) {
    this.game = game;
    this.targets = []; // Initialize empty; we'll populate in generateTargets
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
 const round = this.game.state.round;
 const healthMultiplier = 1 + Math.floor((round - 1) / 10) * 0.1;
 const heavyArmor = this.armorTypes.heavy;
 const heavyPattern = this.damagePatterns[heavyArmor.damagePattern]; // "bigHit"

 if (!heavyPattern) {
 console.error(`Invalid damage pattern for extra tank: ${heavyArmor.damagePattern}`);
 return; // Exit if pattern is invalid
 }

 // Determine number of extra tanks: 1 for early rounds, 2 for later rounds
 const extraTanks = round >= 5 ? 2 : 1;
 for (let i = 0; i < extraTanks; i++) {
 const extraTank = {
 health: Math.round(heavyArmor.maxHealth * healthMultiplier),
 maxHealth: Math.round(heavyArmor.maxHealth * healthMultiplier),
 armor: "heavy",
 damagePattern: heavyArmor.damagePattern, // Assign "bigHit"
 nextTick: heavyPattern.type === "burst" ? heavyPattern.interval : 0,
 warningActive: false,
 dotTimeRemaining: 0,
 renewTime: 0,
 shield: 0,
 shieldTime: 0
 };
 targets.push(extraTank);
 console.log(`Added extra tank ${i + 1}: Health ${extraTank.health}, Pattern ${extraTank.damagePattern}`);
 }
 }
},
      criticalCondition: {
        message: "Critical Condition Round!",
        applyEffect: (targets) => {
          console.log("Applying Critical Condition Modifier: One target starts at 30 HP.");
          const targetIndex = Math.floor(Math.random() * targets.length);
          if (targets[targetIndex]) {
            targets[targetIndex].health = 30;
            console.log(`Target ${targetIndex} set to 10 HP for Critical Condition`);
          }
        }
      }
    };
    
    // Define armor types with their properties
    this.armorTypes = {
      heavy: {
        maxHealth: 150,
        damagePattern: "bigHit"
      },
      medium: {
        maxHealth: 100,
        damagePattern: ["snipe", "sustained"]
      },
      light: {
        maxHealth: 80,
        damagePattern: ["dot", "escalatingDot"]
      }
    };

    // Define damage patterns with their behavior
    this.damagePatterns = {
      bigHit: { type: "burst", amount: 20, interval: 3, warning: 2 },
      snipe: { type: "burst", amount: 10, interval: 4 },
      sustained: { type: "sustained", rate: 4 },
      dot: { type: "dot", rate: 3, duration: 5 },
      escalatingDot: { type: "escalatingDot", initialRate: 2, escalation: 1, duration: 9 }
    };
  }

  reset() {
    this.targets = [{ health: 75, maxHealth: 100, damageRate: 2, renewTime: 0, shield: 0, shieldTime: 0 }];
  }

  generateTargets() {
    this.targets = []; // Clear existing targets
    const round = this.game.state.round;
const healthMultiplier = 1 + Math.floor((round - 1) / 10) * 0.1; // +10% per 10 rounds

    // Step 1: Add one Heavy armor target
    const heavyArmor = this.armorTypes.heavy;
    const heavyDamagePattern = heavyArmor.damagePattern; // "bigHit"
    const heavyPattern = this.damagePatterns[heavyDamagePattern];
    
    // Validate heavyPattern to prevent undefined issues
    if (!heavyPattern) {
      console.error(`Invalid damage pattern for heavy armor: ${heavyDamagePattern}`);
      return; // Exit early to avoid pushing invalid targets
    }

  const heavyTarget = {
    health: Math.round(heavyArmor.maxHealth * healthMultiplier),
    maxHealth: Math.round(heavyArmor.maxHealth * healthMultiplier),
    armor: "heavy",
    damagePattern: heavyDamagePattern,
    nextTick: heavyPattern.type === "burst" ? (heavyPattern.interval || 0) : 0,
    warningActive: false,
    dotTimeRemaining: 
      heavyPattern.type === "dot" || heavyPattern.type === "escalatingDot" 
        ? (heavyPattern.duration || 0) 
        : 0,
    renewTime: 0,
    shield: 0,
    shieldTime: 0
  };
    this.targets.push(heavyTarget);

// Step 2: Determine number of additional targets (Medium or Light)
let additionalTargets;
const maxUnits = 10;
const startingUnits = 1; // 1 Heavy
const roundThreshold = 20; // By round 20, we want 5 total units

if (round === 1) {
  additionalTargets = 1; // 1 Heavy + 1 additional
} else {
  // Scale additional targets based on the round count
  additionalTargets = Math.min(maxUnits - startingUnits, Math.floor((round - 1) / (roundThreshold / (maxUnits - startingUnits))));
}

    // Apply a random modifier with 50% chance
  if (Math.random() < 0.5) {
    const modifierKeys = Object.keys(this.modifiers);
    const selectedModifier = this.modifiers[modifierKeys[Math.floor(Math.random() * modifierKeys.length)]];
    console.log(`Applying modifier: ${selectedModifier.message}`);
    selectedModifier.applyEffect(this.targets);
    this.game.uiManager.setModifierMessage(selectedModifier.message, 5); // Display for 5 seconds
  } else {
    // Custom modifiers
    if (Math.random() < 0.33) {
      // All Light Armor
      this.targets = [heavyTarget];
      for (let i = 0; i < additionalTargets; i++) {
        const lightArmor = this.armorTypes.light;
        const damagePattern = lightArmor.damagePattern[Math.floor(Math.random() * lightArmor.damagePattern.length)];
        const pattern = this.damagePatterns[damagePattern];
        this.targets.push({
          health: Math.round(lightArmor.maxHealth * healthMultiplier),
          maxHealth: Math.round(lightArmor.maxHealth * healthMultiplier),
          armor: "light",
          damagePattern: damagePattern,
          nextTick: pattern.type === "burst" ? (pattern.interval || 0) : 0,
          warningActive: false,
          dotTimeRemaining: 
            pattern.type === "dot" || pattern.type === "escalatingDot" 
              ? (pattern.duration || 0) 
              : 0,
          renewTime: 0,
          shield: 0,
          shieldTime: 0
        });
      }
      this.game.uiManager.setModifierMessage("All Light Armor Round!", 5);
    } else if (Math.random() < 0.66) {
      // All Medium Armor
      this.targets = [heavyTarget];
      for (let i = 0; i < additionalTargets; i++) {
        const mediumArmor = this.armorTypes.medium;
        const damagePattern = mediumArmor.damagePattern[Math.floor(Math.random() * mediumArmor.damagePattern.length)];
        const pattern = this.damagePatterns[damagePattern];
        this.targets.push({
          health: Math.round(mediumArmor.maxHealth * healthMultiplier),
          maxHealth: Math.round(mediumArmor.maxHealth * healthMultiplier),
          armor: "medium",
          damagePattern: damagePattern,
          nextTick: pattern.type === "burst" ? (pattern.interval || 0) : 0,
          warningActive: false,
          dotTimeRemaining: 
            pattern.type === "dot" || pattern.type === "escalatingDot" 
              ? (pattern.duration || 0) 
              : 0,
          renewTime: 0,
          shield: 0,
          shieldTime: 0
        });
      }
      this.game.uiManager.setModifierMessage("All Medium Armor Round!", 5);
    } else {
      // Incoming Heavy Damage (flag a random target)
      const highDamageIndex = Math.floor(Math.random() * (additionalTargets + 1));
      this.targets[highDamageIndex].highDamage = true; // Add a flag
      this.game.uiManager.setModifierMessage(`Incoming Heavy Damage on Target ${highDamageIndex}!`, 5);
    }
  }

  // Fallback to random mix if no modifier applied
  if (this.targets.length === 1) {
    for (let i = 0; i < additionalTargets; i++) {
      const armor = Math.random() < 0.5 ? "medium" : "light";
      const armorType = this.armorTypes[armor];
      const damagePatternOptions = Array.isArray(armorType.damagePattern)
        ? armorType.damagePattern
        : [armorType.damagePattern];
      const damagePattern = damagePatternOptions[Math.floor(Math.random() * damagePatternOptions.length)];
      const pattern = this.damagePatterns[damagePattern];

      if (!pattern) {
        console.error(`Invalid damage pattern for ${armor} armor: ${damagePattern}`);
        continue;
      }

      const target = {
        health: Math.round(armorType.maxHealth * healthMultiplier),
        maxHealth: Math.round(armorType.maxHealth * healthMultiplier),
        armor: armor,
        damagePattern: damagePattern,
        nextTick: pattern.type === "burst" ? (pattern.interval || 0) : 0,
        warningActive: false,
        dotTimeRemaining: 
          pattern.type === "dot" || pattern.type === "escalatingDot" 
            ? (pattern.duration || 0) 
            : 0,
        renewTime: 0,
        shield: 0,
        shieldTime: 0
      };
      console.log(`Creating target - Armor: ${armor}, Health: ${target.health}, Damage Pattern: ${damagePattern}`);
      this.targets.push(target);
    }
  }
}

  updateTargets(timePassed) {
  const round = this.game.state.round;
  const damageMultiplier = 1 + Math.floor((round - 1) / 10) * 0.05;

  this.targets.forEach((target, i) => {
    const pattern = this.damagePatterns[target.damagePattern];
    if (!pattern) {
      console.error(`Invalid damage pattern for target ${i}: ${target.damagePattern}`);
      return;
    }
    let damage = 0;

    if (pattern.type === "burst") {
      target.nextTick -= timePassed;
      if (target.nextTick <= pattern.warning) {
        target.warningActive = true;
      }
      if (target.nextTick <= 0) {
        damage = pattern.amount * damageMultiplier * (target.highDamage ? 2 : 1); // Double damage if flagged
        target.nextTick += pattern.interval;
        target.warningActive = false;
      }
    } else if (pattern.type === "sustained") {
      damage = pattern.rate * damageMultiplier * (target.highDamage ? 2 : 1) * timePassed;
    } else if (pattern.type === "dot" && target.dotTimeRemaining > 0) {
      damage = pattern.rate * damageMultiplier * (target.highDamage ? 2 : 1) * timePassed;
      target.dotTimeRemaining -= timePassed;
      if (target.dotTimeRemaining <= 0) {
        target.dotTimeRemaining = 0;
      }
    } else if (pattern.type === "escalatingDot" && target.dotTimeRemaining > 0) {
      const timeElapsed = pattern.duration - target.dotTimeRemaining;
      const escalations = Math.floor(timeElapsed / 3);
      const currentRate = pattern.initialRate + pattern.escalation * escalations;
      damage = currentRate * damageMultiplier * (target.highDamage ? 2 : 1) * timePassed;
      target.dotTimeRemaining -= timePassed;
      if (target.dotTimeRemaining <= 0) {
        target.dotTimeRemaining = 0;
      }
    }

    if (target.shield > 0) {
      const absorbed = Math.min(damage, target.shield);
      target.shield -= absorbed;
      damage -= absorbed;
      target.shieldTime -= timePassed;
      if (target.shieldTime <= 0) target.shield = 0;
    }
    target.health = Math.max(0, target.health - damage);

    if (target.renewTime > 0) {
      const healPerTick = this.game.spellManager.spells.renew.healAmount / this.game.spellManager.spells.renew.duration;
      const healing = healPerTick * timePassed;
      target.health = Math.min(target.maxHealth, target.health + healing);
      target.renewTime = Math.max(0, target.renewTime - timePassed);
    }
  });
}

  checkLossCondition() {
    return this.targets.some(t => t.health <= 0);
  }
}
    
    class UIManager {
  constructor(game, spellManager, targetManager, manaManager) {
    this.game = game;
    this.spellManager = spellManager;
    this.targetManager = targetManager;
    this.manaManager = manaManager; // Use the passed ManaManager instance
    this.modifierMessage = "";
    this.modifierMessageTimer = 0;
    this.debouncedUpdate = this.debounce(this.update.bind(this), 50);

    // Define spellIconsMap inside the constructor
    this.spellIconsMap = {
      lesserHeal: { src: "assets/images/icons/lesserheal.png", binding: "Left-click", displayName: "Lesser Heal" },
      heal: { src: "assets/images/icons/lesserheal.png", binding: "Left-click", displayName: "Heal" },
      greaterHeal: { src: "assets/images/icons/lesserheal.png", binding: "Left-click", displayName: "Greater Heal" },
      flashHeal: { src: "assets/images/icons/flashheal.png", binding: "Right-click", displayName: "Flash Heal" },
      renew: { src: "assets/images/icons/renew.png", binding: "Shift + Left-click", displayName: "Renew" },
      chainHeal: { src: "assets/images/icons/chainheal.png", binding: "Ctrl + Left-click", displayName: "Chain Heal" },
      shield: { src: "assets/images/icons/shield.png", binding: "Alt + Left-click", displayName: "Shield" }
    };

    this.checkDOMElements();    
  }
  checkDOMElements() {
    const requiredElements = ["status", "manaFill", "manaText", "castBar", "castFill", "castText", "eventMessage", "healthBars", "talents", "spellBar"];
    requiredElements.forEach(id => {
      if (!document.getElementById(id)) {
        console.warn(`Required DOM element #${id} not found`);
      }
    });
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

generateTooltipText(spell) {
  let text = `<strong>${this.spellIconsMap[spell.name].displayName}:</strong> `;
  if (spell.healAmount) {
    text += `Heals ${spell.healAmount} HP${spell.duration ? ` over ${spell.duration}s` : ""}, `;
  } else if (spell.shieldAmount) {
    text += `Shields ${spell.shieldAmount} HP for ${spell.duration}s, `;
  }
  if (spell.secondaryHeal) {
    text += `(+${spell.secondaryHeal} HP to adjacent), `;
  }
  text += `Mana Cost: ${spell.manaCost}`;
  if (spell.castTime > 0) {
    text += `, Cast Time: ${spell.castTime}s`;
  }
  if (spell.duration && !spell.healAmount) {
    text += `, Duration: ${spell.duration}s`;
  }
  text += `, Binding: ${this.spellIconsMap[spell.name].binding}`;
  const canCast = spell.enabled && !this.spellManager.casting && this.game.manaManager.getMana() >= spell.manaCost;
  if (!canCast) {
    text += `, <span style="color: red;">${this.spellManager.casting ? "Casting in progress" : "Not enough mana"}</span>`;
  }
  return text;
}

  getSpellDescription(spellType) {
    return this.spellIconsMap[spellType].displayName;
  }

update() {
  if (!this.game.state.gameStarted) return;

  const status = document.getElementById("status");
  if (status) {
    status.innerHTML = this.game.state.inRound
      ? `Round ${this.game.state.round} - Time: ${Math.ceil(this.game.state.roundTime)}s`
      : `Round ${this.game.state.round} Complete!`;
  }

// Update mana display using ManaManager
const manaFill = document.getElementById("manaFill");
const manaText = document.getElementById("manaText");
if (manaFill && manaText) {
  let displayMana, displayMaxMana;
  if (this.game.state.postRound) {
    this.manaManager.calculateProjectedMana(this.game.state.round + 1);
    displayMana = this.manaManager.getProjectedMana();
    displayMaxMana = this.manaManager.getProjectedMaxMana();
  } else {
    displayMana = this.manaManager.getMana();
    displayMaxMana = this.manaManager.getMaxMana();
  }
  // Enhanced safeguards against NaN or undefined
  displayMana = Number.isFinite(displayMana) ? displayMana : 0;
  displayMaxMana = Number.isFinite(displayMaxMana) ? displayMaxMana : 100;
  if (displayMaxMana <= 0) displayMaxMana = 100; // Prevent division by zero
  const percentage = (displayMana / displayMaxMana) * 100;
  manaFill.style.width = `${Math.min(100, Math.max(0, percentage))}%`; // Clamp percentage between 0 and 100
  // Ensure the display values are integers
  manaText.innerHTML = `${Math.floor(displayMana)}/${Math.floor(displayMaxMana)}`;
}


const castBar = document.getElementById("castBar");
  const castFill = document.getElementById("castFill");
  const castText = document.getElementById("castText");
  if (castBar && castFill && castText) {
    if (this.game.state.inRound && this.spellManager.casting) { // Only show if in round and casting
      castBar.style.display = "block";
      const progressPercent = (this.spellManager.castProgress / this.spellManager.castDuration) * 100;
      castFill.style.width = `${progressPercent}%`;
      const remainingTime = Math.max(0, (this.spellManager.castDuration - this.spellManager.castProgress)).toFixed(1);
      const spellType = this.spellManager.castSpellType;
      const displayName = this.spellIconsMap[spellType].displayName;
      castText.innerHTML = `Casting ${displayName} (${remainingTime}s)...`;
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
    const totalMax = target.maxHealth;
    const healthPercent = (target.health / totalMax) * 100;
    const shieldPercent = target.shield > 0 ? (target.shield / totalMax) * 100 : 0;
    const healthWidth = Math.min(100, healthPercent);
    const shieldLeft = healthWidth;
    const shieldWidth = Math.min(100 - healthWidth, shieldPercent);

    const renewRemaining = target.renewTime > 0 ? Math.max(0, target.renewTime).toFixed(1) : 0;
    const healthTextColor = target.renewTime > 0 ? "green" : "#3c2f2f";
    const renewText = target.renewTime > 0 ? ` (+${renewRemaining}s)` : "";
    const highDamageClass = target.highDamage ? "high-damage" : "";
    const armorIcon = target.armor === "heavy" ? "assets/images/icons/harmor.png" 
                      : target.armor === "medium" ? "assets/images/icons/marmor.png" 
                      : "assets/images/icons/larmor.png";

    healthBarsHTML += `
      <div class="health-bar ${highDamageClass}" onmousedown="if (window.game && window.game.spellManager) window.game.spellManager.cast(event, ${i}); else console.log('window.game or spellManager undefined on health bar click at index ${i}');" oncontextmenu="return false;">
        <img src="${armorIcon}" alt="${target.armor} armor" class="armor-icon" />
        <div class="health-fill" id="healthFill${i}" style="width: ${healthWidth}%;"></div>
        <div class="shield-fill" id="shieldFill${i}" style="left: ${shieldLeft}%; width: ${shieldWidth}%;"></div>
        <div class="health-text" id="healthText${i}" style="color: ${healthTextColor};">
          ${Math.floor(target.health)}/${target.maxHealth}${target.shield > 0 ? ` (+${Math.floor(target.shield)})` : ""}${renewText}
        </div>
      </div>
    `;
  });
  const healthBars = document.getElementById("healthBars");
  if (healthBars) healthBars.innerHTML = healthBarsHTML;
}

  // Update spell selection with tooltips
    const talents = document.getElementById("talents");
    if (talents) {
      if (this.game.state.postRound && !this.game.state.gameEnded) {
        let availableSpells = [];
        if (this.game.state.round % 2 === 0 && !this.game.state.spellSelected) {
          if (!this.spellManager.spells.flashHeal.enabled) {
            const desc = this.getSpellDescription("flashHeal");
            const tooltipText = this.generateTooltipText(this.spellManager.spells.flashHeal);
            availableSpells.push(`
              <div class="spell-slot spell-slot-selection" onmouseover="this.querySelector('.tooltip').style.display='block'" onmouseout="this.querySelector('.tooltip').style.display='none'">
                <img src="${this.spellIconsMap.flashHeal.src}" class="spell-icon" alt="flashHeal">
                <div class="tooltip">${tooltipText}</div>
                <button onclick="if (window.game && window.game.spellManager) window.game.spellManager.unlock('flashHeal'); else console.log('window.game or spellManager undefined');">${desc}</button>
              </div>
            `);
          }
          if (!this.spellManager.spells.heal.enabled) {
            const desc = this.getSpellDescription("heal");
            const tooltipText = this.generateTooltipText(this.spellManager.spells.heal);
            availableSpells.push(`
              <div class="spell-slot spell-slot-selection" onmouseover="this.querySelector('.tooltip').style.display='block'" onmouseout="this.querySelector('.tooltip').style.display='none'">
                <img src="${this.spellIconsMap.heal.src}" class="spell-icon" alt="heal">
                <div class="tooltip">${tooltipText}</div>
                <button onclick="if (window.game && window.game.spellManager) window.game.spellManager.unlock('heal'); else console.log('window.game or spellManager undefined');">${desc}</button>
              </div>
            `);
          }
          if (!this.spellManager.spells.renew.enabled) {
            const desc = this.getSpellDescription("renew");
            const tooltipText = this.generateTooltipText(this.spellManager.spells.renew);
            availableSpells.push(`
              <div class="spell-slot spell-slot-selection" onmouseover="this.querySelector('.tooltip').style.display='block'" onmouseout="this.querySelector('.tooltip').style.display='none'">
                <img src="${this.spellIconsMap.renew.src}" class="spell-icon" alt="renew">
                <div class="tooltip">${tooltipText}</div>
                <button onclick="if (window.game && window.game.spellManager) window.game.spellManager.unlock('renew'); else console.log('window.game or spellManager undefined');">${desc}</button>
              </div>
            `);
          }
          if (!this.spellManager.spells.greaterHeal.enabled && this.spellManager.spells.heal.enabled) {
            const desc = this.getSpellDescription("greaterHeal");
            const tooltipText = this.generateTooltipText(this.spellManager.spells.greaterHeal);
            availableSpells.push(`
              <div class="spell-slot spell-slot-selection" onmouseover="this.querySelector('.tooltip').style.display='block'" onmouseout="this.querySelector('.tooltip').style.display='none'">
                <img src="${this.spellIconsMap.greaterHeal.src}" class="spell-icon" alt="greaterHeal">
                <div class="tooltip">${tooltipText}</div>
                <button onclick="if (window.game && window.game.spellManager) window.game.spellManager.unlock('greaterHeal'); else console.log('window.game or spellManager undefined');">${desc}</button>
              </div>
            `);
          }
          if (!this.spellManager.spells.chainHeal.enabled) {
            const desc = this.getSpellDescription("chainHeal");
            const tooltipText = this.generateTooltipText(this.spellManager.spells.chainHeal);
            availableSpells.push(`
              <div class="spell-slot spell-slot-selection" onmouseover="this.querySelector('.tooltip').style.display='block'" onmouseout="this.querySelector('.tooltip').style.display='none'">
                <img src="${this.spellIconsMap.chainHeal.src}" class="spell-icon" alt="chainHeal">
                <div class="tooltip">${tooltipText}</div>
                <button onclick="if (window.game && window.game.spellManager) window.game.spellManager.unlock('chainHeal'); else console.log('window.game or spellManager undefined');">${desc}</button>
              </div>
            `);
          }
          if (!this.spellManager.spells.shield.enabled) {
            const desc = this.getSpellDescription("shield");
            const tooltipText = this.generateTooltipText(this.spellManager.spells.shield);
            availableSpells.push(`
              <div class="spell-slot spell-slot-selection" onmouseover="this.querySelector('.tooltip').style.display='block'" onmouseout="this.querySelector('.tooltip').style.display='none'">
                <img src="${this.spellIconsMap.shield.src}" class="spell-icon" alt="shield">
                <div class="tooltip">${tooltipText}</div>
                <button onclick="if (window.game && window.game.spellManager) window.game.spellManager.unlock('shield'); else console.log('window.game or spellManager undefined');">${desc}</button>
              </div>
            `);
          }
        }
        talents.innerHTML = availableSpells.length > 0
          ? `<p>Choose a new spell:</p>${availableSpells.join(" ")}`
          : `<p>Round ${this.game.state.round} Complete! Continue to the next challenge?</p><button onclick="if (window.game) window.game.nextRound(); else console.log('window.game undefined');">Next Round</button>`;
      } else if (this.game.state.inRound) {
        talents.innerHTML = "";
      } else {
        talents.innerHTML = `<p>Game Over! You reached Round ${this.game.state.round}.</p><button onclick="if (window.game) window.game.reset(); else console.log('window.game undefined');">Play Again</button>`;
      }
    }

  // Update spell bar for both in-round and post-round (after spell selection)
const spellBar = document.getElementById("spellBar");
if (spellBar) {
  // Show spell bar during in-round or post-round after spell selection
  if (this.game.state.inRound || (this.game.state.postRound && this.game.state.spellSelected)) {
    let primaryHealType;
    if (this.spellManager.spells.greaterHeal.enabled) {
      primaryHealType = "greaterHeal";
    } else if (this.spellManager.spells.heal.enabled) {
      primaryHealType = "heal";
    } else {
      primaryHealType = "lesserHeal";
    }

    const spellTypesToDisplay = [primaryHealType];
    if (this.spellManager.spells.flashHeal.enabled) spellTypesToDisplay.push("flashHeal");
    if (this.spellManager.spells.renew.enabled) spellTypesToDisplay.push("renew");
    if (this.spellManager.spells.chainHeal.enabled) spellTypesToDisplay.push("chainHeal");
    if (this.spellManager.spells.shield.enabled) spellTypesToDisplay.push("shield");

    const spellIcons = spellTypesToDisplay.map(spellType => {
      const spell = this.spellManager.spells[spellType];
      return {
        ...spell,
        src: this.spellIconsMap[spellType].src,
        binding: this.spellIconsMap[spellType].binding,
        displayName: this.spellIconsMap[spellType].displayName
      };
    });

    let spellBarHTML = "";
    spellIcons.forEach((spell) => {
      // Check if the spell is currently being cast
      const isSpellBeingCast = this.spellManager.casting && this.spellManager.castSpellType === spell.name;
      // Only grey out if not currently casting this spell and mana is insufficient
      const canCast = spell.enabled && !isSpellBeingCast && this.game.manaManager.getMana() >= spell.manaCost;
      // Only apply uncastable class during inRound, not in postRound, and if canCast is false
      const iconClass = (this.game.state.inRound && !canCast) ? "spell-icon uncastable" : "spell-icon";
      const tooltipText = this.generateTooltipText(spell);
      // Remove mana-cost span in post-round for simplicity
      const manaCostSpan = this.game.state.inRound ? `<span class="mana-cost">${spell.manaCost}</span>` : "";
      spellBarHTML += `
        <div class="spell-slot" onmouseover="this.querySelector('.tooltip').style.display='block'" onmouseout="this.querySelector('.tooltip').style.display='none'">
          <img src="${spell.src}" class="${iconClass}" alt="${spell.name}">
          <div class="tooltip">${tooltipText}</div>
          ${manaCostSpan}
        </div>
      `;
    });
    spellBar.innerHTML = spellBarHTML;
  } else {
    spellBar.innerHTML = "";
  }
}
}
}

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

window.game = new Game();

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded, calling reset...");
  if (window.game) {
    window.game.reset();
  } else {
    console.error("window.game is undefined on DOM load");
  }

  const startButton = document.getElementById("startButton");
  if (startButton) {
    startButton.addEventListener("click", () => {
      console.log("Start button clicked");
      if (window.game) {
        window.game.start();
      } else {
        console.error("window.game is undefined on start button click");
      }
    });
  } else {
    console.error("Start button not found");
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "F1") {
      const panel = document.getElementById("debugPanel");
      if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
    }
  });
});

window.onfocus = () => {
  if (window.game && window.game.state.inRound && window.game.state.gameStarted && !window.game.state.gameEnded) window.game.update();
};

function addMana(amount) {
  if (window.game) {
    window.game.manaManager.addMana(amount);
    window.game.uiManager.update();
  } else {
    console.error("window.game is undefined in addMana");
  }
}

function skipRound() {
  if (window.game) {
    window.game.state.roundTime = 0;
    window.game.update();
  } else {
    console.error("window.game is undefined in skipRound");
  }
}
