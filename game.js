// Remove the direct instantiation of window.game
// window.game = new Game();

// Instead, create a factory function to handle async initialization
async function createGame() {
  const game = new Game();
  await game.init();
  return game;
}

// Update the DOMContentLoaded event listener to handle async creation
document.addEventListener("DOMContentLoaded", async () => {
  console.log("DOM fully loaded, creating game...");
  window.game = await createGame();
  if (window.game) {
    await window.game.reset();
  } else {
    console.error("window.game is undefined after creation");
  }

  const startButton = document.getElementById("startButton");
  if (startButton) {
    startButton.addEventListener("click", async () => {
      console.log("Start button clicked");
      if (window.game) {
        await window.game.start();
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

// Update reset method to be async
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
    this.manaManager = new ManaManager(this);
    this.spellManager = new SpellManager(this);
    this.targetManager = new TargetManager(this);
    this.synergyManager = new SynergyManager(this);
    this.uiManager = new UIManager(this, this.spellManager, this.targetManager, this.manaManager);
    this.leaderboardManager = new LeaderboardManager(this.uiManager);
    this.objective = null;
  }

  async init() {
    await this.spellManager.init();
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
  this.state.lastUpdate = Date.now();
  this.state.lastGlobalLog = Date.now();
  this.manaManager.reset();
  this.spellManager.reset();
  this.targetManager.reset();
  this.synergyManager.activeSpells = [];
  this.synergyManager.activeHealBoosts = [];
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
  
  // Set spellSelected to false for rounds 5, 10, 15, 20 to allow spell selection
  this.state.spellSelected = ![5, 10, 15, 20].includes(this.state.round);
  console.log(`Spell selection ${this.state.spellSelected ? "not available" : "available"} for Round ${this.state.round}`);

  this.state.lastUpdate = Date.now();
  this.spellManager.stopCasting();
  if (!this.state.updateInterval) {
    this.state.updateInterval = setInterval(() => this.update(), 100);
  }
  this.targetManager.generateTargets();
  this.uiManager.update();
}

update() {
  if (!this.state.gameStarted) return;

  const now = Date.now();
  if (!Number.isFinite(this.state.lastUpdate)) {
    console.warn(`lastUpdate is invalid: ${this.state.lastUpdate}, resetting to now`);
    this.state.lastUpdate = now;
  }
  let timePassed = (now - this.state.lastUpdate) / 1000;
  if (!Number.isFinite(timePassed) || timePassed < 0) {
    console.warn(`Invalid timePassed: ${timePassed}, resetting to 0`);
    timePassed = 0;
  }

  this.manaManager.update(timePassed);
  this.state.roundTime -= timePassed;

  this.targetManager.updateTargets(timePassed);
  this.spellManager.updateCasting(timePassed);
  this.synergyManager.update(timePassed);

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
    this.spellManager.stopCasting();
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
    this.manaPerCast = null;
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
  if (!Number.isFinite(this.mana)) {
    console.warn(`Mana is NaN, resetting to 0`);
    this.mana = 0;
  }
  if (!Number.isFinite(amount)) {
    console.warn(`Deduct amount is NaN, setting to 0`);
    amount = 0;
  }
  if (this.mana >= amount) {
    this.mana -= amount;
    if (this.manaPerCast && this.manaPerCast.castsRemaining > 0) {
      this.addMana(this.manaPerCast.amount);
      this.manaPerCast.castsRemaining--;
      if (this.manaPerCast.castsRemaining <= 0) this.manaPerCast = null;
    }
    console.log(`Deducted ${amount} mana, now ${this.mana}/${this.maxMana}`);
    return true;
  }
  console.log(`Not enough mana to deduct: ${this.mana} < ${amount}`);
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
  if (!Number.isFinite(this.mana)) {
    console.warn(`Mana is NaN in getMana, returning 0`);
    return 0;
  }
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


class SpellManager {
  constructor(game) {
    this.game = game;
    this.manaManager = game.manaManager;
    this.spellDefinitions = {};
    this.spells = {};
    this.casting = false;
    this.castProgress = 0;
    this.castDuration = 0;
    this.castTargetIndex = -1;
    this.castSpellType = "";
  }

  async init() {
    await this.loadSpells();
  }

  async loadSpells() {
  try {
    const response = await fetch("spells.json");
    if (!response.ok) throw new Error("Failed to load spells.json");
    this.spellDefinitions = await response.json();
    console.log("Loaded spells from spells.json:", Object.fromEntries(
      Object.entries(this.spellDefinitions).map(([id, spell]) => [id, { enabled: spell.enabled }])
    ));
    this.spells = this.initializeSpells();
  } catch (error) {
    console.error("Error loading spells:", error);
    // Fallback to default spells if loading fails
    this.spellDefinitions = {
      lesserHeal: {
        id: "lesserHeal",
        name: "Lesser Heal",
        enabled: true,
        castTime: 1.5,
        manaCost: 15,
        effect: { type: "heal", amount: 20 },
        inputBinding: { button: 0, modifier: null },
      },
      heal: {
        id: "heal",
        name: "Heal",
        enabled: false,
        castTime: 2.5,
        manaCost: 20,
        effect: { type: "heal", amount: 30 },
        inputBinding: { button: 0, modifier: null },
      },
      flashHeal: {
        id: "flashHeal",
        name: "Flash Heal",
        enabled: false,
        castTime: 1,
        manaCost: 20,
        effect: { type: "heal", amount: 40 },
        inputBinding: { button: 2, modifier: null },
      },
      renew: {
        id: "renew",
        name: "Renew",
        enabled: false,
        castTime: 1.5,
        manaCost: 20,
        effect: { type: "hot", amount: 5, duration: 10 },
        inputBinding: { button: 0, modifier: "shift" },
      },
      greaterHeal: {
        id: "greaterHeal",
        name: "Greater Heal",
        enabled: false,
        castTime: 3,
        manaCost: 30,
        effect: { type: "heal", amount: 50 },
        inputBinding: { button: 0, modifier: null },
      },
      chainHeal: {
        id: "chainHeal",
        name: "Chain Heal",
        enabled: false,
        castTime: 2,
        manaCost: 35,
        effect: { type: "chainHeal", amount: 30, secondaryAmount: 15 },
        inputBinding: { button: 0, modifier: "ctrl" },
      },
      shield: {
        id: "shield",
        name: "Shield",
        enabled: false,
        castTime: 0,
        manaCost: 20,
        effect: { type: "shield", amount: 20, duration: 5 },
        inputBinding: { button: 0, modifier: "alt" },
      },
      rejuvenation: {
        id: "rejuvenation",
        name: "Rejuvenation",
        enabled: false,
        castTime: 0,
        manaCost: 25,
        effect: { type: "hot", amount: 10, duration: 10 },
        inputBinding: { button: 0, modifier: "shift" },
      },
      divineProtection: {
        id: "divineProtection",
        name: "Divine Protection",
        enabled: false,
        castTime: 0,
        manaCost: 25,
        effect: { type: "damageReduction", amount: 0.5, duration: 5 },
        inputBinding: { button: 1, modifier: "alt" },
      },
      harmonize: {
        id: "harmonize",
        name: "Harmonize",
        enabled: false,
        castTime: 2,
        manaCost: 35,
        effect: { type: "spreadHeal", amount: 0.5 },
        inputBinding: { button: 0, modifier: "ctrl" },
      },
      mendWounds: {
        id: "mendWounds",
        name: "Mend Wounds",
        enabled: false,
        castTime: 1.5,
        manaCost: 20,
        effect: { type: "heal", amount: 25, hotAmount: 5, hotDuration: 5, cleanse: true },
        inputBinding: { button: 1, modifier: "shift" },
      },
      guardianWard: {
        id: "guardianWard",
        name: "Guardian Ward",
        enabled: false,
        castTime: 0,
        manaCost: 20,
        effect: { type: "shield", amount: 20, duration: 6, healOnEnd: 10 },
        inputBinding: { button: 1, modifier: "alt" },
      },
      purify: {
        id: "purify",
        name: "Purify",
        enabled: false,
        castTime: 1,
        manaCost: 20,
        effect: { type: "cleanse", preventDuration: 3 },
        inputBinding: { button: 1, modifier: "ctrl" },
      },
      lifebloom: {
        id: "lifebloom",
        name: "Lifebloom",
        enabled: false,
        castTime: 0,
        manaCost: 10,
        effect: { type: "delayedHeal", amount: 50, delay: 10 },
        inputBinding: { button: 1, modifier: "shift" },
      },
      divineChannel: {
        id: "divineChannel",
        name: "Divine Channel",
        enabled: false,
        castTime: 5,
        manaCost: 0,
        effect: { type: "manaGain", amount: 100, duration: 5 },
        inputBinding: { button: 1, modifier: "ctrl" },
      },
      decoy: {
        id: "decoy",
        name: "Decoy",
        enabled: false,
        castTime: 1,
        manaCost: 30,
        effect: { type: "spawnClone", duration: 5 },
        inputBinding: { button: 1, modifier: "alt" },
      },
      bindingHeal: {
        id: "bindingHeal",
        name: "Binding Heal",
        enabled: false,
        castTime: 2,
        manaCost: 25,
        effect: { type: "heal", amount: 30, secondaryTarget: "lowestHealth", secondaryAmount: 15 },
        inputBinding: { button: 0, modifier: null },
      },
      healingPlague: {
        id: "healingPlague",
        name: "Healing Plague",
        enabled: false,
        castTime: 2.5,
        manaCost: 30,
        effect: { type: "hotSpread", amount: 15, duration: 8, spreadTargets: 2 },
        inputBinding: { button: 0, modifier: "shift" },
      },
      timeStop: {
        id: "timeStop",
        name: "Time Stop",
        enabled: false,
        castTime: 3,
        manaCost: 40,
        effect: { type: "damagePrevention", duration: 2 },
        inputBinding: { button: 0, modifier: "ctrl" },
      },
      shadowStrike: {
        id: "shadowStrike",
        name: "Shadow Strike",
        enabled: false,
        castTime: 1.5,
        manaCost: 25,
        effect: { type: "healBasedOnMissing", percentage: 0.3 },
        inputBinding: { button: 0, modifier: "alt" },
      },
      seraphicBlessing: {
        id: "seraphicBlessing",
        name: "Seraphic Blessing",
        enabled: false,
        castTime: 0,
        manaCost: 0,
        effect: { type: "passive", healBoost: 0.1 },
        inputBinding: null,
      },
      vitalBond: {
        id: "vitalBond",
        name: "Vital Bond",
        enabled: false,
        castTime: 0,
        manaCost: 20,
        effect: { type: "healRandom", amount: 15 },
        inputBinding: { button: 1, modifier: null },
      },
      echoHealing: {
        id: "echoHealing",
        name: "Echo Healing",
        enabled: false,
        castTime: 0,
        manaCost: 15,
        effect: { type: "echoHeal", percentage: 0.5, delay: 3 },
        inputBinding: { button: 1, modifier: "shift" },
      },
      guardianAngel: {
        id: "guardianAngel",
        name: "Guardian Angel",
        enabled: false,
        castTime: 0,
        manaCost: 35,
        effect: { type: "preventDeath", duration: 5 },
        inputBinding: { button: 1, modifier: "alt" },
      },
      overgrowth: {
        id: "overgrowth",
        name: "Overgrowth",
        enabled: false,
        castTime: 0,
        manaCost: 20,
        effect: { type: "extendHot", duration: 5 },
        inputBinding: { button: 1, modifier: "ctrl" },
      },
      manaConduit: {
        id: "manaConduit",
        name: "Mana Conduit",
        enabled: false,
        castTime: 0,
        manaCost: 0,
        effect: { type: "manaPerCast", amount: 20, casts: 5 },
        inputBinding: null,
      },
      soulbond: {
        id: "soulbond",
        name: "Soulbond",
        enabled: false,
        castTime: 0,
        manaCost: 25,
        effect: { type: "linkHeal", percentage: 0.5 },
        inputBinding: { button: 1, modifier: null },
      },
      healingSpirit: {
        id: "healingSpirit",
        name: "Healing Spirit",
        enabled: false,
        castTime: 2,
        manaCost: 40,
        effect: { type: "spawnHealer", amount: 5, duration: 10 },
        inputBinding: { button: 1, modifier: "shift" },
      },
    };
    this.spells = this.initializeSpells();
  }
}

  initializeSpells() {
    const spells = {};
    for (const [key, definition] of Object.entries(this.spellDefinitions)) {
      spells[key] = { ...definition };
    }
    return spells;
  }

reset() {
  this.spells = this.initializeSpells();
  // Explicitly set enabled states to match initial conditions
  for (const spellId in this.spells) {
    if (spellId === "lesserHeal") {
      this.spells[spellId].enabled = true;
    } else {
      this.spells[spellId].enabled = false;
    }
  }
  console.log("Spells after reset:", Object.fromEntries(
    Object.entries(this.spells).map(([id, spell]) => [id, { enabled: spell.enabled }])
  ));
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

  getSpellForInput(event) {
    const { button } = event;
    const modifier = event.ctrlKey ? "ctrl" : event.altKey ? "alt" : event.shiftKey ? "shift" : null;
    const spell = Object.values(this.spells).find(
      (s) =>
        s.inputBinding &&
        s.inputBinding.button === button &&
        s.inputBinding.modifier === modifier &&
        s.enabled
    );
    if (spell) return spell;

    if (button === 0 && !modifier) {
      if (this.spells.greaterHeal.enabled) return this.spells.greaterHeal;
      if (this.spells.heal.enabled) return this.spells.heal;
      return this.spells.lesserHeal;
    }
    return null;
  }

    applyEffect(target, spell, targetIndex) {
  const { type, amount, duration, secondaryAmount, delay, percentage, secondaryTarget, spreadTargets, hotAmount, hotDuration, cleanse, healOnEnd, preventDuration } = spell.effect;

  switch (type) {
    case "heal":
      let healAmount = amount;
      if (spell.id === "mendWounds" && hotAmount) {
        target.hotAmount = hotAmount;
        target.hotTime = hotDuration;
        if (cleanse) target.dotTimeRemaining = 0;
      }
      if (spell.id === "bindingHeal" && secondaryTarget === "lowestHealth") {
        const lowestTarget = this.game.targetManager.targets.reduce((min, t) => t.health < min.health ? t : min);
        lowestTarget.health = Math.min(lowestTarget.maxHealth, lowestTarget.health + secondaryAmount);
        console.log(`${spell.name} healed lowest health target for ${secondaryAmount}`);
      }
      target.health = Math.min(target.maxHealth, target.health + healAmount);
      console.log(`${spell.name} healed target ${targetIndex} for ${healAmount}, new health: ${target.health}`);
      this.game.uiManager.update(); // Force UI update after healing
      break;
      case "hot":
        target.hotAmount = amount;
        target.hotTime = duration;
        console.log(`${spell.name} applied to target ${targetIndex} for ${duration}s`);
        break;
      case "shield":
        target.shield = amount;
        target.shieldTime = duration;
        if (spell.id === "guardianWard" && healOnEnd) {
          setTimeout(() => {
            target.health = Math.min(target.maxHealth, target.health + healOnEnd);
            console.log(`${spell.name} healed target ${targetIndex} for ${healOnEnd} on shield end`);
          }, duration * 1000);
        }
        console.log(`${spell.name} applied to target ${targetIndex} for ${amount} HP, ${duration}s`);
        break;
      case "chainHeal":
        target.health = Math.min(target.maxHealth, target.health + amount);
        console.log(`${spell.name} healed target ${targetIndex} for ${amount}`);
        const nextIndex = (targetIndex + 1) % this.game.targetManager.targets.length;
        const nextTarget = this.game.targetManager.targets[nextIndex];
        if (nextTarget.health < nextTarget.maxHealth) {
          nextTarget.health = Math.min(nextTarget.maxHealth, nextTarget.health + secondaryAmount);
          console.log(`${spell.name} healed adjacent target ${nextIndex} for ${secondaryAmount}`);
        }
        break;
      case "spawnClone":
        this.game.targetManager.addClone(targetIndex, duration);
        console.log(`${spell.name} spawned a clone for target ${targetIndex} for ${duration}s`);
        break;
      case "damageReduction":
        target.damageReduction = amount;
        target.damageReductionTime = duration;
        console.log(`${spell.name} reduced damage by ${amount * 100}% on target ${targetIndex} for ${duration}s`);
        break;
      case "spreadHeal":
        this.game.targetManager.targets.forEach((t, i) => {
          if (i !== targetIndex) t.health = Math.min(t.maxHealth, t.health + amount * target.health);
        });
        console.log(`${spell.name} spread ${amount * 100}% healing from target ${targetIndex}`);
        break;
      case "cleanse":
        target.dotTimeRemaining = 0;
        target.preventDebuffTime = preventDuration;
        console.log(`${spell.name} cleansed target ${targetIndex}, preventing debuffs for ${preventDuration}s`);
        break;
      case "delayedHeal":
        setTimeout(() => {
          target.health = Math.min(target.maxHealth, target.health + amount);
          console.log(`${spell.name} healed target ${targetIndex} for ${amount} after ${delay}s`);
        }, delay * 1000);
        break;
      case "manaGain":
        this.manaManager.addMana(amount);
        console.log(`${spell.name} restored ${amount} mana`);
        break;
      case "hotSpread":
        target.hotAmount = amount;
        target.hotTime = duration;
        let spreadCount = 0;
        this.game.targetManager.targets.forEach((t, i) => {
          if (i !== targetIndex && spreadCount < spreadTargets) {
            t.hotAmount = amount;
            t.hotTime = duration;
            spreadCount++;
          }
        });
        console.log(`${spell.name} applied HoT to target ${targetIndex} and spread to ${spreadCount} targets for ${duration}s`);
        break;
      case "damagePrevention":
        target.damagePreventionTime = duration;
        console.log(`${spell.name} prevents damage on target ${targetIndex} for ${duration}s`);
        break;
      case "healBasedOnMissing":
        const missingHealth = target.maxHealth - target.health;
        target.health = Math.min(target.maxHealth, target.health + missingHealth * percentage);
        console.log(`${spell.name} healed target ${targetIndex} for ${missingHealth * percentage} (30% of missing)`);
        break;
      case "passive":
        if (spell.id === "seraphicBlessing") {
          this.game.spellManager.healBoost = percentage; // Apply globally; adjust as needed
          console.log(`${spell.name} increases all healing by ${percentage * 100}%`);
        }
        break;
      case "healRandom":
        const randomTarget = this.game.targetManager.targets[Math.floor(Math.random() * this.game.targetManager.targets.length)];
        randomTarget.health = Math.min(randomTarget.maxHealth, randomTarget.health + amount);
        console.log(`${spell.name} healed random target for ${amount}`);
        break;
      case "echoHeal":
        setTimeout(() => {
          target.health = Math.min(target.maxHealth, target.health + target.maxHealth * percentage);
          console.log(`${spell.name} echoed ${target.maxHealth * percentage} healing on target ${targetIndex} after ${delay}s`);
        }, delay * 1000);
        break;
      case "preventDeath":
        target.preventDeathTime = duration;
        console.log(`${spell.name} prevents death on target ${targetIndex} for ${duration}s`);
        break;
      case "extendHot":
        this.game.targetManager.targets.forEach(t => {
          if (t.hotTime > 0) t.hotTime += duration;
        });
        console.log(`${spell.name} extended all HoTs by ${duration}s`);
        break;
      case "manaPerCast":
        this.manaManager.manaPerCast = { amount, castsRemaining: spell.effect.casts };
        console.log(`${spell.name} will restore ${amount} mana for next ${spell.effect.casts} casts`);
        break;
      case "linkHeal":
        target.linkedTargetIndex = targetIndex;
        target.linkHealPercentage = percentage;
        console.log(`${spell.name} linked healing to target ${targetIndex} at ${percentage * 100}%`);
        break;
      case "spawnHealer":
        this.game.targetManager.addClone(targetIndex, duration, { healRate: amount });
        console.log(`${spell.name} spawned a healer for ${duration}s healing ${amount} HP/s`);
        break;
    default:
      console.warn(`Unhandled spell effect type: ${type}`);
    }
  }

  cast(event, targetIndex) {
  if (!this.game.state.gameStarted || this.game.state.gameEnded || this.casting || !Number.isFinite(this.game.state.lastUpdate)) {
    console.log("Cannot cast: game not active, already casting, or invalid game state");
    return;
  }
  event.preventDefault();
  const target = this.game.targetManager.targets[targetIndex];
  const spell = this.getSpellForInput(event);

  if (!spell) {
    console.log("Spell cast failed: invalid input or spell not enabled");
    return;
  }
  if (this.game.manaManager.getMana() < spell.manaCost) {
    console.log("Spell cast failed: not enough mana");
    return;
  }
  if (
    target.health >= target.maxHealth &&
    spell.effect.type !== "hot" &&
    spell.effect.type !== "shield"
  ) {
    console.log("Spell cast failed: target at full health");
    return;
  }

  if (!this.game.manaManager.deductMana(spell.manaCost)) {
    console.log("Spell cast failed: not enough mana (deduction failed)");
    return;
  }
  console.log(`Casting ${spell.name} on target ${targetIndex}`);
  this.game.uiManager.update();

  if (spell.castTime === 0) {
    this.applyEffect(target, spell, targetIndex);
    const duration = spell.effect.duration || 0;
    this.game.synergyManager.onSpellCast(spell.id, targetIndex, duration);
  } else {
    this.castTargetIndex = targetIndex;
    this.castSpellType = spell.id;
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
    if (!target) {
      console.warn(`Target ${this.castTargetIndex} not found, cancelling cast`);
      this.casting = false;
      this.castProgress = 0;
      this.castDuration = 0;
      this.castTargetIndex = -1;
      this.castSpellType = "";
      return;
    }
    const spell = this.spells[this.castSpellType];
    this.applyEffect(target, spell, this.castTargetIndex);
    const duration = spell.effect.duration || 0;
    this.game.synergyManager.onSpellCast(spell.id, this.castTargetIndex, duration);
    this.casting = false;
    this.castProgress = 0;
    this.castDuration = 0;
    this.castTargetIndex = -1;
    this.castSpellType = "";
    this.game.uiManager.update(); // Force UI update after cast
  }
}

  unlock(spellId) {
    console.log(`Unlocking spell: ${spellId}`);
    if (spellId === "heal") {
      this.spells.lesserHeal.enabled = false;
      this.spells.heal.enabled = true;
    } else if (spellId === "greaterHeal") {
      this.spells.heal.enabled = false;
      this.spells.greaterHeal.enabled = true;
    } else {
      this.spells[spellId].enabled = true;
    }
    this.game.state.spellSelected = true;
    this.game.state.spellSelectionRound = this.game.state.round;
    this.game.uiManager.update();
    this.game.uiManager.debouncedUpdate();
  }
}

class SynergyManager {
  constructor(game) {
    this.game = game;
    this.activeSpells = []; // [{ spellId, targetIndex, timestamp, duration }]
    this.synergies = {
      "renew-healingPlague": {
        condition: (a, b) => a.targetIndex === b.targetIndex,
        effect: { extendHotDuration: 3 },
        description: "Renew + Healing Plague: Extends Renew's duration by 3s"
      },
      "lesserHeal-bindingHeal": {
        condition: (a, b) => a.targetIndex === b.targetIndex,
        effect: { healBoost: 0.2, duration: 5 },
        description: "Lesser Heal + Binding Heal: Next heal on this target is boosted by 20% for 5s"
      },
      "shield-timeStop": {
        condition: (a, b) => true,
        effect: { extendShieldDuration: 2 },
        description: "Shield + Time Stop: Extends Shield duration by 2s"
      },
      "decoy-healingSpirit": {
        condition: (a, b) => true,
        effect: { cloneHeal: 2 },
        description: "Decoy + Healing Spirit: Clones heal nearby targets for 2 HP/s"
      }
    };
    this.activeHealBoosts = []; // [{ targetIndex, boost, timeRemaining }]
  }

  onSpellCast(spellId, targetIndex, duration) {
    this.activeSpells.push({ spellId, targetIndex, timestamp: Date.now(), duration: duration || 0 });
    this.checkSynergies();
  }

update(timePassed) {
  this.activeSpells = this.activeSpells.filter(s => {
    const remainingTime = s.duration - (Date.now() - s.timestamp) / 1000;
    return remainingTime > 0;
  });

    // Update heal boosts
    this.activeHealBoosts = this.activeHealBoosts.map(boost => ({
      ...boost,
      timeRemaining: boost.timeRemaining - timePassed
    })).filter(boost => boost.timeRemaining > 0);
  }

  checkSynergies() {
    for (const [combo, { condition, effect }] of Object.entries(this.synergies)) {
      const [spellA, spellB] = combo.split("-");
      const activeA = this.activeSpells.find((s) => s.spellId === spellA);
      const activeB = this.activeSpells.find((s) => s.spellId === spellB);
      if (activeA && activeB && condition(activeA, activeB)) {
        this.applySynergy(effect, activeA.targetIndex);
      }
    }
  }

applySynergy(effect, targetIndex) {
    const target = this.game.targetManager.targets[targetIndex];
    if (effect.extendHotDuration) {
      target.hotTime += effect.extendHotDuration;
      console.log(`Synergy: Extended HoT duration by ${effect.extendHotDuration}s on target ${targetIndex}`);
      this.game.uiManager.setModifierMessage(`Synergy: Extended HoT duration by ${effect.extendHotDuration}s on Target ${targetIndex}`, 3);
    }
    if (effect.healBoost) {
      this.activeHealBoosts.push({ targetIndex, boost: effect.healBoost, timeRemaining: effect.duration });
      console.log(`Synergy: Heal boost of ${effect.healBoost * 100}% applied to target ${targetIndex} for ${effect.duration}s`);
      this.game.uiManager.setModifierMessage(`Synergy: Heal boost of ${effect.healBoost * 100}% on Target ${targetIndex} for ${effect.duration}s`, 3);
    }
    if (effect.extendShieldDuration) {
      target.shieldTime += effect.extendShieldDuration;
      console.log(`Synergy: Extended shield duration by ${effect.extendShieldDuration}s on target ${targetIndex}`);
      this.game.uiManager.setModifierMessage(`Synergy: Extended Shield duration by ${effect.extendShieldDuration}s on Target ${targetIndex}`, 3);
    }
    if (effect.cloneHeal) {
      this.game.targetManager.targets.forEach(t => {
        if (t.isClone) t.cloneHealRate = effect.cloneHeal;
      });
      console.log(`Synergy: Clones heal for ${effect.cloneHeal} HP/s`);
      this.game.uiManager.setModifierMessage(`Synergy: Clones heal for ${effect.cloneHeal} HP/s`, 3);
    }
  }

  getHealBoost(targetIndex) {
    const boost = this.activeHealBoosts.find(b => b.targetIndex === targetIndex);
    return boost ? boost.boost : 0;
  }

  getSynergiesForSpell(spellId) {
    return Object.entries(this.synergies)
      .filter(([combo]) => combo.includes(spellId))
      .map(([_, synergy]) => synergy.description);
  }
}

class TargetManager {
  constructor(game) {
    this.game = game;
    this.targets = [];
    this.modifiers = {
      doubleDamage: {
        message: "Double Damage Incoming!",
        applyEffect: (targets) => targets.forEach(t => t.damageRate = (t.damageRate || 2) * 2)
      },
      fastAttack: {
        message: "Fast Attacks Incoming!",
        applyEffect: (targets) => targets.forEach(t => t.nextTick = (t.nextTick || 5) / 2)
      }
    };
this.armorTypes = {
  heavy: { maxHealth: 100, damagePattern: "sustained" },
  medium: { maxHealth: 75, damagePattern: ["burst", "dot"] },
  light: { maxHealth: 50, damagePattern: ["sustained", "escalatingDot"] }
};
this.damagePatterns = {
  sustained: { type: "sustained", rate: 2 },
  burst: { type: "burst", amount: 10, interval: 5, warning: 1 },
  dot: { type: "dot", rate: 3, duration: 5 },
  escalatingDot: { type: "escalatingDot", initialRate: 1, escalation: 1, duration: 10 }
};
  }

reset() {
  this.targets = [{
    health: 75,
    maxHealth: 100,
    armor: "heavy",
    damagePattern: "sustained",
    damageRate: 2,
    hotTime: 0,
    hotAmount: 0,
    shield: 0,
    shieldTime: 0,
    nextTick: 0,
    warningActive: false,
    dotTimeRemaining: 0,
    damageReduction: 0,
    damageReductionTime: 0,
    damagePreventionTime: 0,
    preventDeathTime: 0,
    linkedTargetIndex: null,
    linkHealPercentage: 0,
    lastHealth: 75
  }];
  console.log("Targets after reset:", this.targets);
}

  generateTargets() {
  this.targets = []; // Clear all targets, including clones, to start fresh
  const round = this.game.state.round;
  const healthMultiplier = 1 + Math.floor((round - 1) / 10) * 0.1;

  const heavyArmor = this.armorTypes.heavy;
  const heavyDamagePattern = heavyArmor.damagePattern;
  const heavyPattern = this.damagePatterns[heavyDamagePattern];

  if (!heavyPattern) {
    console.error(`Invalid damage pattern for heavy armor: ${heavyDamagePattern}`);
    return;
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
    hotTime: 0,
    hotAmount: 0,
    shield: 0,
    shieldTime: 0,
    damageReduction: 0,
    damageReductionTime: 0,
    damagePreventionTime: 0,
    preventDeathTime: 0,
    linkedTargetIndex: null,
    linkHealPercentage: 0,
    lastHealth: 0
  };
  this.targets.push(heavyTarget);

  let additionalTargets;
  const maxUnits = 10;
  const startingUnits = 1;
  const roundThreshold = 20;

  if (round === 1) {
    additionalTargets = 1;
  } else {
    additionalTargets = Math.min(maxUnits - startingUnits, Math.floor((round - 1) / (roundThreshold / (maxUnits - startingUnits))));
  }

  if (Math.random() < 0.5) {
    const modifierKeys = Object.keys(this.modifiers);
    const selectedModifier = this.modifiers[modifierKeys[Math.floor(Math.random() * modifierKeys.length)]];
    console.log(`Applying modifier: ${selectedModifier.message}`);
    selectedModifier.applyEffect(this.targets);
    this.game.uiManager.setModifierMessage(selectedModifier.message, 5);
  } else {
    if (Math.random() < 0.33) {
      this.targets = [heavyTarget]; // Reset to just heavyTarget
      for (let i = 0; i < additionalTargets; i++) {
        const lightArmor = this.armorTypes.light;
        const damagePattern = lightArmor.damagePattern[Math.floor(Math.random() * lightArmor.damagePattern.length)];
        const pattern = this.damagePatterns[damagePattern];
        if (!pattern) {
          console.error(`Invalid damage pattern for light armor: ${damagePattern}`);
          continue;
        }
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
          hotTime: 0,
          hotAmount: 0,
          shield: 0,
          shieldTime: 0,
          damageReduction: 0,
          damageReductionTime: 0,
          damagePreventionTime: 0,
          preventDeathTime: 0,
          linkedTargetIndex: null,
          linkHealPercentage: 0,
          lastHealth: 0
        });
      }
      this.game.uiManager.setModifierMessage("All Light Armor Round!", 5);
    } else if (Math.random() < 0.66) {
      this.targets = [heavyTarget]; // Reset to just heavyTarget
      for (let i = 0; i < additionalTargets; i++) {
        const mediumArmor = this.armorTypes.medium;
        const damagePattern = mediumArmor.damagePattern[Math.floor(Math.random() * mediumArmor.damagePattern.length)];
        const pattern = this.damagePatterns[damagePattern];
        if (!pattern) {
          console.error(`Invalid damage pattern for medium armor: ${damagePattern}`);
          continue;
        }
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
          hotTime: 0,
          hotAmount: 0,
          shield: 0,
          shieldTime: 0,
          damageReduction: 0,
          damageReductionTime: 0,
          damagePreventionTime: 0,
          preventDeathTime: 0,
          linkedTargetIndex: null,
          linkHealPercentage: 0,
          lastHealth: 0
        });
      }
      this.game.uiManager.setModifierMessage("All Medium Armor Round!", 5);
    } else {
      const highDamageIndex = Math.floor(Math.random() * (additionalTargets + 1));
      this.targets[highDamageIndex].highDamage = true;
      this.game.uiManager.setModifierMessage(`Incoming Heavy Damage on Target ${highDamageIndex}!`, 5);
    }
  }

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
        hotTime: 0,
        hotAmount: 0,
        shield: 0,
        shieldTime: 0,
        damageReduction: 0,
        damageReductionTime: 0,
        damagePreventionTime: 0,
        preventDeathTime: 0,
        linkedTargetIndex: null,
        linkHealPercentage: 0,
        lastHealth: 0
      };
      console.log(`Creating target - Armor: ${armor}, Health: ${target.health}, Damage Pattern: ${damagePattern}`);
      this.targets.push(target);
    }
  }
}

    addClone(originalIndex, duration) {
    const originalTarget = this.targets[originalIndex];
    const clone = {
      ...originalTarget,
      isClone: true,
      cloneDuration: duration,
      health: originalTarget.maxHealth, // Clones start at full health
      shield: 0,
      shieldTime: 0,
      hotTime: 0,
      hotAmount: 0
    };
    this.targets.push(clone);
    console.log(`Clone added for target ${originalIndex}, duration: ${duration}s`);
  }

  
   updateTargets(timePassed) {
  this.targets = this.targets.filter(target => {
    if (target.isClone) {
      target.cloneDuration -= timePassed;
      if (target.cloneDuration <= 0) {
        console.log(`Clone for target expired`);
        return false;
      }
    }
    return true;
  });

  const round = this.game.state.round;
  const damageMultiplier = 1 + Math.floor((round - 1) / 10) * 0.05;

  this.targets.forEach((target, i) => {
    const pattern = this.damagePatterns[target.damagePattern];
    if (!pattern) {
      console.error(`Invalid damage pattern for target ${i}: ${target.damagePattern}`);
      return;
    }
    let damage = 0;

    if (!Number.isFinite(target.health)) {
      console.warn(`Target ${i} health is NaN, resetting to maxHealth`);
      target.health = target.maxHealth;
    }
    if (!Number.isFinite(target.maxHealth)) {
      console.warn(`Target ${i} maxHealth is NaN, resetting to 100`);
      target.maxHealth = 100;
      target.health = Math.min(target.health, target.maxHealth);
    }

    if (pattern.type === "burst") {
      target.nextTick = (target.nextTick || 0) - timePassed;
      if (target.nextTick <= pattern.warning) target.warningActive = true;
      if (target.nextTick <= 0) {
        damage = pattern.amount * damageMultiplier * (target.highDamage ? 2 : 1);
        target.nextTick += pattern.interval;
        target.warningActive = false;
      }
    } else if (pattern.type === "sustained") {
      damage = pattern.rate * damageMultiplier * (target.highDamage ? 2 : 1) * timePassed;
    } else if (pattern.type === "dot" && (target.dotTimeRemaining || 0) > 0) {
      damage = pattern.rate * damageMultiplier * (target.highDamage ? 2 : 1) * timePassed;
      target.dotTimeRemaining -= timePassed;
      if (target.dotTimeRemaining <= 0) target.dotTimeRemaining = 0;
    } else if (pattern.type === "escalatingDot" && (target.dotTimeRemaining || 0) > 0) {
      const timeElapsed = pattern.duration - target.dotTimeRemaining;
      const escalations = Math.floor(timeElapsed / 3);
      const currentRate = pattern.initialRate + pattern.escalation * escalations;
      damage = currentRate * damageMultiplier * (target.highDamage ? 2 : 1) * timePassed;
      target.dotTimeRemaining -= timePassed;
      if (target.dotTimeRemaining <= 0) target.dotTimeRemaining = 0;
    }

    if (!Number.isFinite(damage)) {
      console.warn(`Damage for target ${i} is NaN, setting to 0`);
      damage = 0;
    }

    if (target.damagePreventionTime > 0) {
      damage = 0;
      target.damagePreventionTime -= timePassed;
      if (target.damagePreventionTime <= 0) target.damagePreventionTime = 0;
    } else if (target.damageReductionTime > 0) {
      damage *= (1 - (target.damageReduction || 0));
      target.damageReductionTime -= timePassed;
      if (target.damageReductionTime <= 0) target.damageReduction = 0;
    }

    if (target.shield > 0) {
      const absorbed = Math.min(damage, target.shield);
      target.shield -= absorbed;
      damage -= absorbed;
      target.shieldTime -= timePassed;
      if (target.shieldTime <= 0) target.shield = 0;
    }

    if (target.preventDeathTime > 0) {
      target.health = Math.max(1, target.health - damage);
      target.preventDeathTime -= timePassed;
      if (target.preventDeathTime <= 0) target.preventDeathTime = 0;
    } else {
      target.health = Math.max(0, target.health - damage);
    }

    if (target.hotTime > 0) {
      const healing = (target.hotAmount || 0) * timePassed;
      if (!Number.isFinite(healing)) {
      } else {
        target.health = Math.min(target.maxHealth, target.health + healing);
      }
      target.hotTime = Math.max(0, target.hotTime - timePassed);
    }

    if (target.cloneHealRate) {
      this.targets.forEach((other, j) => {
        if (i !== j && !other.isClone) {
          other.health = Math.min(other.maxHealth, other.health + target.cloneHealRate * timePassed);
        }
      });
    }

    if (target.isClone && target.healRate) {
      this.targets.forEach((other, j) => {
        if (i !== j && !other.isClone) {
          other.health = Math.min(other.maxHealth, other.health + target.healRate * timePassed);
        }
      });
    }

    target.lastHealth = target.health || 0;
    const healReceived = (target.health || 0) - (target.lastHealth || 0);
    if (target.linkHealPercentage && target.linkedTargetIndex !== i && healReceived > 0) {
      const linkedTarget = this.targets[target.linkedTargetIndex];
      if (linkedTarget) {
        linkedTarget.health = Math.min(linkedTarget.maxHealth, linkedTarget.health + healReceived * target.linkHealPercentage);
      }
    }
    this.game.uiManager.update(); // Force UI update after target update
  });
}

  addClone(originalIndex, duration, options = {}) {
    const originalTarget = this.targets[originalIndex];
    const clone = {
      ...originalTarget,
      isClone: true,
      cloneDuration: duration,
      health: originalTarget.maxHealth,
      shield: 0,
      shieldTime: 0,
      hotTime: 0,
      hotAmount: 0,
      healRate: options.healRate || 0 // For spawnHealer
    };
    this.targets.push(clone);
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
    this.manaManager = manaManager;
    this.modifierMessage = "";
    this.modifierMessageTimer = 0;
    this.lastUpdate = Date.now(); // Add local timing
    this.debouncedUpdate = this.debounce(this.update.bind(this), 50);

  // Cache DOM elements
  this.statusElement = document.getElementById("status");
  this.manaFillElement = document.getElementById("manaFill");
  this.manaTextElement = document.getElementById("manaText");
  this.castBarElement = document.getElementById("castBar");
  this.castFillElement = document.getElementById("castFill");
  this.castTextElement = document.getElementById("castText");
  this.eventMessageElement = document.getElementById("eventMessage");
  this.healthBarsElement = document.getElementById("healthBars");
  this.talentsElement = document.getElementById("talents");
  this.spellBarElement = document.getElementById("spellBar");

    // Define spellIconsMap inside the constructor for all spells
    this.spellIconsMap = {
      lesserHeal: { src: "assets/images/icons/lesserheal.png", binding: "Left-click", displayName: "Lesser Heal" },
      heal: { src: "assets/images/icons/lesserheal.png", binding: "Left-click", displayName: "Heal" },
      greaterHeal: { src: "assets/images/icons/lesserheal.png", binding: "Left-click", displayName: "Greater Heal" },
      flashHeal: { src: "assets/images/icons/flashheal.png", binding: "Right-click", displayName: "Flash Heal" },
      renew: { src: "assets/images/icons/renew.png", binding: "Shift + Left-click", displayName: "Renew" },
      chainHeal: { src: "assets/images/icons/chainheal.png", binding: "Ctrl + Left-click", displayName: "Chain Heal" },
      shield: { src: "assets/images/icons/shield.png", binding: "Alt + Left-click", displayName: "Shield" },
      rejuvenation: { src: "assets/images/icons/renew.png", binding: "Shift + Left-click", displayName: "Rejuvenation" },
      divineProtection: { src: "assets/images/icons/shield.png", binding: "Alt + Right-click", displayName: "Divine Protection" },
      harmonize: { src: "assets/images/icons/chainheal.png", binding: "Ctrl + Left-click", displayName: "Harmonize" },
      mendWounds: { src: "assets/images/icons/lesserheal.png", binding: "Shift + Right-click", displayName: "Mend Wounds" },
      guardianWard: { src: "assets/images/icons/shield.png", binding: "Alt + Right-click", displayName: "Guardian Ward" },
      purify: { src: "assets/images/icons/lesserheal.png", binding: "Ctrl + Right-click", displayName: "Purify" },
      lifebloom: { src: "assets/images/icons/renew.png", binding: "Shift + Right-click", displayName: "Lifebloom" },
      divineChannel: { src: "assets/images/icons/lesserheal.png", binding: "Ctrl + Right-click", displayName: "Divine Channel" },
      decoy: { src: "assets/images/icons/shield.png", binding: "Alt + Right-click", displayName: "Decoy" },
      bindingHeal: { src: "assets/images/icons/lesserheal.png", binding: "Left-click", displayName: "Binding Heal" },
      healingPlague: { src: "assets/images/icons/renew.png", binding: "Shift + Left-click", displayName: "Healing Plague" },
      timeStop: { src: "assets/images/icons/shield.png", binding: "Ctrl + Left-click", displayName: "Time Stop" },
      shadowStrike: { src: "assets/images/icons/lesserheal.png", binding: "Alt + Left-click", displayName: "Shadow Strike" },
      seraphicBlessing: { src: "assets/images/icons/lesserheal.png", binding: "Passive", displayName: "Seraphic Blessing" },
      vitalBond: { src: "assets/images/icons/lesserheal.png", binding: "Right-click", displayName: "Vital Bond" },
      echoHealing: { src: "assets/images/icons/renew.png", binding: "Shift + Right-click", displayName: "Echo Healing" },
      guardianAngel: { src: "assets/images/icons/shield.png", binding: "Alt + Right-click", displayName: "Guardian Angel" },
      overgrowth: { src: "assets/images/icons/renew.png", binding: "Ctrl + Right-click", displayName: "Overgrowth" },
      manaConduit: { src: "assets/images/icons/lesserheal.png", binding: "Passive", displayName: "Mana Conduit" },
      soulbond: { src: "assets/images/icons/lesserheal.png", binding: "Right-click", displayName: "Soulbond" },
      healingSpirit: { src: "assets/images/icons/renew.png", binding: "Shift + Right-click", displayName: "Healing Spirit" }
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
    let text = `<strong>${this.spellIconsMap[spell.id]?.displayName || spell.name}:</strong> `;
    if (spell.effect.type === "heal" || spell.effect.type === "chainHeal") {
      text += `Heals ${spell.effect.amount} HP`;
      if (spell.effect.type === "chainHeal") {
        text += ` (+${spell.effect.secondaryAmount} HP to adjacent)`;
      }
      if (spell.effect.secondaryTarget) {
        text += ` (+${spell.effect.secondaryAmount} HP to ${spell.effect.secondaryTarget})`;
      }
      text += ", ";
    } else if (spell.effect.type === "hot" || spell.effect.type === "hotSpread") {
      text += `Heals ${spell.effect.amount} HP over ${spell.effect.duration}s`;
      if (spell.effect.type === "hotSpread") {
        text += ` (spreads to ${spell.effect.spreadTargets} targets)`;
      }
      text += ", ";
    } else if (spell.effect.type === "shield") {
      text += `Shields ${spell.effect.amount} HP for ${spell.effect.duration}s`;
      if (spell.effect.healOnEnd) {
        text += ` (heals ${spell.effect.healOnEnd} HP on end)`;
      }
      text += ", ";
    } else if (spell.effect.type === "damageReduction") {
      text += `Reduces damage by ${(spell.effect.amount * 100).toFixed(0)}% for ${spell.effect.duration}s, `;
    } else if (spell.effect.type === "spreadHeal") {
      text += `Spreads ${(spell.effect.amount * 100).toFixed(0)}% of healing to nearby targets, `;
    } else if (spell.effect.type === "cleanse") {
      text += `Cleanses debuffs and prevents new ones for ${spell.effect.preventDuration}s, `;
    } else if (spell.effect.type === "delayedHeal") {
      text += `Heals ${spell.effect.amount} HP after ${spell.effect.delay}s, `;
    } else if (spell.effect.type === "manaGain") {
      text += `Restores ${spell.effect.amount} mana over ${spell.effect.duration}s, `;
    } else if (spell.effect.type === "spawnClone") {
      text += `Spawns a clone for ${spell.effect.duration}s, `;
    } else if (spell.effect.type === "healBasedOnMissing") {
      text += `Heals ${(spell.effect.percentage * 100).toFixed(0)}% of missing HP, `;
    } else if (spell.effect.type === "passive") {
      if (spell.effect.healBoost) {
        text += `Increases healing by ${(spell.effect.healBoost * 100).toFixed(0)}%, `;
      }
    } else if (spell.effect.type === "healRandom") {
      text += `Heals a random target for ${spell.effect.amount} HP, `;
    } else if (spell.effect.type === "echoHeal") {
      text += `Echoes ${(spell.effect.percentage * 100).toFixed(0)}% of healing after ${spell.effect.delay}s, `;
    } else if (spell.effect.type === "preventDeath") {
      text += `Prevents death for ${spell.effect.duration}s, `;
    } else if (spell.effect.type === "extendHot") {
      text += `Extends HoT durations by ${spell.effect.duration}s, `;
    } else if (spell.effect.type === "manaPerCast") {
      text += `Restores ${spell.effect.amount} mana for the next ${spell.effect.casts} casts, `;
    } else if (spell.effect.type === "linkHeal") {
      text += `Links to a target, healing them for ${(spell.effect.percentage * 100).toFixed(0)}% of healing done, `;
    } else if (spell.effect.type === "spawnHealer") {
      text += `Spawns a healer that heals ${spell.effect.amount} HP/s for ${spell.effect.duration}s, `;
    } else if (spell.effect.type === "damagePrevention") {
      text += `Prevents all damage for ${spell.effect.duration}s, `;
    }

    text += `Mana Cost: ${spell.manaCost}`;
    if (spell.castTime > 0) {
      text += `, Cast Time: ${spell.castTime}s`;
    }
    if (spell.effect.duration && spell.effect.type !== "hot" && spell.effect.type !== "hotSpread" && spell.effect.type !== "manaGain" && spell.effect.type !== "delayedHeal") {
      text += `, Duration: ${spell.effect.duration}s`;
    }
    text += `, Binding: ${this.spellIconsMap[spell.id]?.binding || "None"}`;
    const canCast = spell.enabled && !this.spellManager.casting && this.game.manaManager.getMana() >= spell.manaCost;
    if (!canCast) {
      text += `, <span style="color: red;">${this.spellManager.casting ? "Casting in progress" : "Not enough mana"}</span>`;
    }

    // Add synergy information
    const synergies = this.game.synergyManager.getSynergiesForSpell(spell.id);
    if (synergies.length > 0) {
      text += `<br><strong>Synergies:</strong> ${synergies.join(", ")}`;
    }

    return text;
  }

  getSpellDescription(spellType) {
    return this.spellIconsMap[spellType]?.displayName || spellType;
  }

update() {
  if (!this.game.state.gameStarted) return;

  const now = Date.now();
  const timePassed = (now - this.lastUpdate) / 1000;

  if (this.statusElement) {
    const roundTime = Number.isFinite(this.game.state.roundTime) ? Math.ceil(this.game.state.roundTime) : 0;
    this.statusElement.innerHTML = this.game.state.inRound
      ? `Round ${this.game.state.round} - Time: ${roundTime}s`
      : `Round ${this.game.state.round} Complete!`;
  }

  // Update mana display using ManaManager
  if (this.manaFillElement && this.manaTextElement) {
    let displayMana, displayMaxMana;
    if (this.game.state.postRound) {
      this.manaManager.calculateProjectedMana(this.game.state.round + 1);
      displayMana = this.manaManager.getProjectedMana();
      displayMaxMana = this.manaManager.getProjectedMaxMana();
    } else {
      displayMana = this.manaManager.getMana();
      displayMaxMana = this.manaManager.getMaxMana();
    }
    displayMana = Number.isFinite(displayMana) ? displayMana : 0;
    displayMaxMana = Number.isFinite(displayMaxMana) ? displayMaxMana : 100;
    if (displayMaxMana <= 0) displayMaxMana = 100;
    const percentage = (displayMana / displayMaxMana) * 100;
    this.manaFillElement.style.width = `${Math.min(100, Math.max(0, percentage))}%`;
    this.manaTextElement.innerHTML = `${Math.floor(displayMana)}/${Math.floor(displayMaxMana)}`;
  }

  if (this.castBarElement && this.castFillElement && this.castTextElement) {
    if (this.game.state.inRound && this.spellManager.casting) {
      this.castBarElement.style.display = "block";
      const progressPercent = (this.spellManager.castProgress / this.spellManager.castDuration) * 100;
      this.castFillElement.style.width = `${progressPercent}%`;
      const remainingTime = Math.max(0, (this.spellManager.castDuration - this.spellManager.castProgress)).toFixed(1);
      const spellType = this.spellManager.castSpellType;
      const displayName = this.spellIconsMap[spellType]?.displayName || spellType;
      this.castTextElement.innerHTML = `Casting ${displayName} (${remainingTime}s)...`;
    } else {
      this.castBarElement.style.display = "none";
    }
  }

  if (this.eventMessageElement) {
    this.eventMessageElement.innerHTML = this.modifierMessage;
    if (this.modifierMessageTimer > 0) {
      this.modifierMessageTimer -= timePassed;
      if (this.modifierMessageTimer <= 0) this.modifierMessage = "";
    }
  }

  let healthBarsHTML = "";
  if (this.game.state.inRound) {
    this.targetManager.targets.forEach((target, i) => {
      const totalMax = target.maxHealth || 100;
      const health = Number.isFinite(target.health) ? target.health : 0;
      const healthPercent = (health / totalMax) * 100;
      const shieldPercent = target.shield > 0 ? (target.shield / totalMax) * 100 : 0;
      const healthWidth = Math.min(100, healthPercent);
      const shieldLeft = healthWidth;
      const shieldWidth = Math.min(100 - healthWidth, shieldPercent);

      const hotRemaining = target.hotTime > 0 ? Math.max(0, target.hotTime).toFixed(1) : 0;
      const healthTextColor = target.hotTime > 0 ? "green" : "#3c2f2f";
      const hotText = target.hotTime > 0 ? ` (+${hotRemaining}s)` : "";
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
            ${Math.floor(health)}/${totalMax}${target.shield > 0 ? ` (+${Math.floor(target.shield)})` : ""}${hotText}
          </div>
        </div>
      `;
    });
    if (this.healthBarsElement) this.healthBarsElement.innerHTML = healthBarsHTML;
  }

  if (this.talentsElement) {
    if (this.game.state.postRound && !this.game.state.gameEnded) {
      let availableSpells = [];
      if ([5, 10, 15, 20].includes(this.game.state.round) && !this.game.state.spellSelected) {
        const unlockableSpells = Object.keys(this.spellManager.spells).filter(spellId => {
          const spell = this.spellManager.spells[spellId];
          if (spell.enabled) return false;
          if (spellId === "greaterHeal" && !this.spellManager.spells.heal.enabled) return false;
          return true;
        });
        const numSpellsToOffer = Math.min(3, unlockableSpells.length);
        const shuffledSpells = unlockableSpells.sort(() => Math.random() - 0.5).slice(0, numSpellsToOffer);
        shuffledSpells.forEach(spellId => {
          const desc = this.getSpellDescription(spellId);
          const tooltipText = this.generateTooltipText(this.spellManager.spells[spellId]);
          availableSpells.push(`
            <div class="spell-slot spell-slot-selection" onmouseover="this.querySelector('.tooltip').style.display='block'" onmouseout="this.querySelector('.tooltip').style.display='none'">
              <img src="${this.spellIconsMap[spellId].src}" class="spell-icon" alt="${spellId}">
              <div class="tooltip">${tooltipText}</div>
              <button onclick="if (window.game && window.game.spellManager) window.game.spellManager.unlock('${spellId}'); else console.log('window.game or spellManager undefined');">${desc}</button>
            </div>
          `);
        });
      }
      this.talentsElement.innerHTML = availableSpells.length > 0
        ? `<p>Choose a new spell:</p>${availableSpells.join(" ")}`
        : `<p>Round ${this.game.state.round} Complete! Continue to the next challenge?</p><button onclick="if (window.game) window.game.nextRound(); else console.log('window.game undefined');">Next Round</button>`;
    } else if (this.game.state.inRound) {
      this.talentsElement.innerHTML = "";
    } else {
      this.talentsElement.innerHTML = `<p>Game Over! You reached Round ${this.game.state.round}.</p><button onclick="if (window.game) window.game.reset(); else console.log('window.game undefined');">Play Again</button>`;
    }
  }

  if (this.spellBarElement) {
    let spellBarHTML = "";
    if (this.game.state.inRound || (this.game.state.postRound && this.game.state.spellSelected)) {
      let primaryHealType;
      if (this.spellManager.spells.greaterHeal.enabled) {
        primaryHealType = "greaterHeal";
      } else if (this.spellManager.spells.heal.enabled) {
        primaryHealType = "heal";
      } else {
        primaryHealType = "lesserHeal";
      }

      const spellTypesToDisplay = Object.keys(this.spellManager.spells).filter(spellId => {
        const spell = this.spellManager.spells[spellId];
        return spell.enabled && spell.inputBinding;
      });

      console.log(`Spells to display: ${spellTypesToDisplay.join(", ")}`);

      const primaryIndex = spellTypesToDisplay.indexOf(primaryHealType);
      if (primaryIndex !== -1) {
        spellTypesToDisplay.splice(primaryIndex, 1);
        spellTypesToDisplay.unshift(primaryHealType);
      }

      const spellIcons = spellTypesToDisplay.map(spellType => {
        const spell = this.spellManager.spells[spellType];
        return {
          ...spell,
          src: this.spellIconsMap[spellType]?.src || "assets/images/icons/default.png",
          binding: this.spellIconsMap[spellType]?.binding || "None",
          displayName: this.spellIconsMap[spellType]?.displayName || spell.name
        };
      });

      spellIcons.forEach((spell) => {
        const isSpellBeingCast = this.spellManager.casting && this.spellManager.castSpellType === spell.id;
        const canCast = spell.enabled && !isSpellBeingCast && this.game.manaManager.getMana() >= spell.manaCost;
        const iconClass = (this.game.state.inRound && !canCast) ? "spell-icon uncastable" : "spell-icon";
        const tooltipText = this.generateTooltipText(spell);
        const manaCostSpan = this.game.state.inRound ? `<span class="mana-cost">${spell.manaCost}</span>` : "";
        spellBarHTML += `
          <div class="spell-slot" onmouseover="this.querySelector('.tooltip').style.display='block'" onmouseout="this.querySelector('.tooltip').style.display='none'">
            <img src="${spell.src}" class="${iconClass}" alt="${spell.id}">
            <div class="tooltip">${tooltipText}</div>
            ${manaCostSpan}
          </div>
        `;
      });
    }
    this.spellBarElement.innerHTML = spellBarHTML;
  }

  this.lastUpdate = now;
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
      if (!response.ok) throw new Error(`Failed to load leaderboard: ${response.status}`);
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
      this.uiManager.setModifierMessage("Failed to load leaderboard, using default.", 5);
      console.log("Using default leaderboard:", this.leaderboard);
    }
    this.display();
  }

  async save(result) {
    const playerName = prompt(`Game Over! You reached Round ${this.uiManager.game.state.round}! Enter your name:`);
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
          this.uiManager.setModifierMessage("Failed to save leaderboard.", 5);
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

window.onfocus = () => {
  if (window.game && window.game.state.inRound && window.game.state.gameStarted && !window.game.state.gameEnded) window.game.update();
};

async function addMana(amount) {
  if (window.game) {
    window.game.manaManager.addMana(amount);
    window.game.uiManager.update();
  } else {
    console.error("window.game is undefined in addMana");
  }
}

async function skipRound() {
  if (window.game) {
    window.game.state.roundTime = 0;
    window.game.update();
  } else {
    console.error("window.game is undefined in skipRound");
  }
}
