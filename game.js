// Game class to manage core state and flow
class Game {
  constructor() {
    this.state = {
      round: 1,
      mana: 100,
      maxMana: 100,
      manaRegen: 3,
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
    this.spellManager = new SpellManager(this);
    this.targetManager = new TargetManager(this);
    this.uiManager = new UIManager(this, this.spellManager, this.targetManager);
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
    this.state.mana = 100;
    this.state.maxMana = 100;
    this.state.manaRegen = 3;
    this.state.roundTime = 10;
    this.state.inRound = true;
    this.state.gameStarted = false;
    this.state.spellSelected = false;
    this.state.spellSelectionRound = 0;
    this.state.gameEnded = false;
    this.state.postRound = false;
    if (this.state.updateInterval) clearInterval(this.state.updateInterval);
    this.state.updateInterval = null;
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
  this.state.inRound = true;
  this.state.postRound = false;
  if (this.state.round % 2 !== 0) {
    this.state.spellSelected = false;
  }
  this.state.lastUpdate = Date.now();
  this.spellManager.stopCasting(); // Ensure no casts persist into the new round
  if (!this.state.updateInterval) {
    this.state.updateInterval = setInterval(() => this.update(), 100);
  }
  this.targetManager.generateTargets();
  this.setObjective();
  this.uiManager.update();
}

  setObjective() {
    this.objective = {
      description: "Ensure no target dies",
      check: () => !this.targetManager.checkLossCondition()
    };
  }

  update() {
    if (!this.state.gameStarted || this.state.gameEnded || !this.state.inRound) return;

    const now = Date.now();
    const timePassed = (now - this.state.lastUpdate) / 1000;

    this.state.mana = Math.min(this.state.maxMana, this.state.mana + this.state.manaRegen * timePassed);
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
      this.state.inRound = false;
      this.state.postRound = true;
      if (this.state.updateInterval) {
        clearInterval(this.state.updateInterval);
        this.state.updateInterval = null;
      }
    }

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
    if (this.game.state.mana < spell.manaCost) {
      console.log("Spell cast failed: not enough mana");
      return;
    }
    if (target.health >= target.maxHealth && spellType !== "renew" && spellType !== "shield") {
      console.log("Spell cast failed: target at full health");
      return;
    }

    this.game.state.mana -= spell.manaCost;
    console.log(`Casting ${spellType} on target ${targetIndex}`);

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
    this.game.uiManager.update();
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
    this.targets = [{ health: 75, maxHealth: 100, damageRate: 2, renewTime: 0, shield: 0, shieldTime: 0 }];
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
          targets.push({ health: 100, maxHealth: 100, damageRate: 3, renewTime: 0, shield: 0, shieldTime: 0 });
        }
      },
      criticalCondition: {
        message: "Critical Condition Round!",
        applyEffect: (targets) => {
          console.log("Applying Critical Condition Modifier: One target starts at 10 HP.");
          const targetIndex = Math.floor(Math.random() * targets.length);
          if (targets[targetIndex]) {
            targets[targetIndex].health = 10;
            console.log(`Target ${targetIndex} set to 10 HP for Critical Condition`);
          }
        }
      }
    };
  }

  reset() {
    this.targets = [{ health: 75, maxHealth: 100, damageRate: 2, renewTime: 0, shield: 0, shieldTime: 0 }];
  }

  generateTargets() {
    this.targets = [];
    const round = this.game.state.round;

    if (round === 1) {
      this.targets = [{ health: 60, maxHealth: 100, damageRate: 4, renewTime: 0, shield: 0, shieldTime: 0 }];
      this.game.state.roundTime = 10;
    } else if (round === 2) {
      this.targets = [
        { health: 80, maxHealth: 100, damageRate: 2, renewTime: 0, shield: 0, shieldTime: 0 },
        { health: 80, maxHealth: 100, damageRate: 2, renewTime: 0, shield: 0, shieldTime: 0 }
      ];
    } else if (round === 3) {
      this.targets = [
        { health: 90, maxHealth: 100, damageRate: 2, renewTime: 0, shield: 0, shieldTime: 0 },
        { health: 90, maxHealth: 100, damageRate: 2, renewTime: 0, shield: 0, shieldTime: 0 },
        { health: 90, maxHealth: 100, damageRate: 3, renewTime: 0, shield: 0, shieldTime: 0 }
      ];
    } else if (round === 4) {
      this.targets = [
        { health: 95, maxHealth: 100, damageRate: 2.5, renewTime: 0, shield: 0, shieldTime: 0 },
        { health: 95, maxHealth: 100, damageRate: 2.5, renewTime: 0, shield: 0, shieldTime: 0 },
        { health: 95, maxHealth: 100, damageRate: 2.5, renewTime: 0, shield: 0, shieldTime: 0 },
        { health: 95, maxHealth: 100, damageRate: 2.5, renewTime: 0, shield: 0, shieldTime: 0 }
      ];
    } else if (round === 5) {
      this.targets = [
        { health: 30, maxHealth: 100, damageRate: 4, renewTime: 0, shield: 0, shieldTime: 0 },
        { health: 50, maxHealth: 100, damageRate: 2, renewTime: 0, shield: 0, shieldTime: 0 },
        { health: 50, maxHealth: 100, damageRate: 2, renewTime: 0, shield: 0, shieldTime: 0 }
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
        if (appliedModifier && this.game.uiManager.modifierMessage.includes("Critical Condition")) {
          health = 10;
        }

        this.targets.push({ health, maxHealth: 100, damageRate, renewTime: 0, shield: 0, shieldTime: 0 });
      }
    }
  }

  updateTargets(timePassed) {
    this.targets.forEach((target, i) => {
      let damage = target.damageRate * timePassed;
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
        if (healing > 0) {
          target.lastHealing = healing;
          console.log(`Renew healing target ${i}: +${Math.floor(healing)} HP, new health: ${Math.floor(target.health)}`);
        }
      } else {
        target.lastHealing = 0;
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

class UIManager {
  constructor(game, spellManager, targetManager) {
    this.game = game;
    this.spellManager = spellManager;
    this.targetManager = targetManager;
    this.modifierMessage = "";
    this.modifierMessageTimer = 0;
    this.debouncedUpdate = this.debounce(this.update.bind(this), 50);
    this.checkDOMElements();
  }

  // UI-specific data for spells (icons, bindings, display names)
  spellIconsMap = {
    lesserHeal: { src: "assets/images/icons/lesserheal.png", binding: "Left-click", displayName: "Lesser Heal" },
    heal: { src: "assets/images/icons/heal.png", binding: "Left-click", displayName: "Heal" },
    greaterHeal: { src: "assets/images/icons/greaterheal.png", binding: "Left-click", displayName: "Greater Heal" },
    flashHeal: { src: "assets/images/icons/flashheal.png", binding: "Right-click", displayName: "Flash Heal" },
    renew: { src: "assets/images/icons/renew.png", binding: "Shift + Left-click", displayName: "Renew" },
    chainHeal: { src: "assets/images/icons/chainheal.png", binding: "Ctrl + Left-click", displayName: "Chain Heal" },
    shield: { src: "assets/images/icons/shield.png", binding: "Alt + Left-click", displayName: "Shield" }
  };

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
    let text = `<strong>${this.spellIconsMap[spell.name].displayName}:</strong><br>`;
    if (spell.healAmount) {
      text += `Heals: ${spell.healAmount} HP`;
      if (spell.duration) {
        text += ` over ${spell.duration}s`;
      }
      text += `<br>`;
    } else if (spell.shieldAmount) {
      text += `Shields: ${spell.shieldAmount} HP for ${spell.duration}s<br>`;
    }
    if (spell.secondaryHeal) {
      text += ` (+${spell.secondaryHeal} HP to adjacent)<br>`;
    }
    text += `Mana Cost: ${spell.manaCost}`;
    if (spell.castTime > 0) {
      text += `<br>Cast Time: ${spell.castTime}s`;
    }
    if (spell.duration && !spell.healAmount) {
      text += `<br>Duration: ${spell.duration}s`;
    }
    text += `<br>Binding: ${this.spellIconsMap[spell.name].binding}`;
    const canCast = spell.enabled && !this.spellManager.casting && this.game.state.mana >= spell.manaCost;
    if (!canCast) {
      text += `<br><span style="color: red;">${this.spellManager.casting ? "Casting in progress" : "Not enough mana"}</span>`;
    }
    return text;
  }

  getSpellDescription(spellType) {
    const spell = this.spellManager.spells[spellType];
    let description = `${this.spellIconsMap[spellType].displayName} (${spell.manaCost} Mana`;
    if (spell.healAmount) {
      description += `, +${spell.healAmount} HP`;
      if (spell.duration) {
        description += ` over ${spell.duration}s`;
      }
    } else if (spell.shieldAmount) {
      description += `, ${spell.shieldAmount} HP absorb for ${spell.duration}s`;
    }
    if (spell.secondaryHeal) {
      description += ` + ${spell.secondaryHeal} HP to adjacent`;
    }
    description += ")";
    if (spellType === "heal") {
      description += " - Replaces Lesser Heal";
    } else if (spellType === "greaterHeal") {
      description += " - Replaces Heal";
    }
    return description;
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

        healthBarsHTML += `
          <div class="health-bar" onmousedown="if (window.game && window.game.spellManager) window.game.spellManager.cast(event, ${i}); else console.log('window.game or spellManager undefined on health bar click at index ${i}');" oncontextmenu="return false;">
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

    const talents = document.getElementById("talents");
    if (talents) {
      if (this.game.state.postRound && !this.game.state.gameEnded) {
        let availableSpells = [];
        if (this.game.state.round % 2 === 0 && !this.game.state.spellSelected) {
          if (!this.spellManager.spells.flashHeal.enabled) {
            const desc = this.getSpellDescription("flashHeal");
            availableSpells.push(`<button onclick="if (window.game && window.game.spellManager) window.game.spellManager.unlock('flashHeal'); else console.log('window.game or spellManager undefined');">${desc}</button>`);
          }
          if (!this.spellManager.spells.heal.enabled) {
            const desc = this.getSpellDescription("heal");
            availableSpells.push(`<button onclick="if (window.game && window.game.spellManager) window.game.spellManager.unlock('heal'); else console.log('window.game or spellManager undefined');">${desc}</button>`);
          }
          if (!this.spellManager.spells.renew.enabled) {
            const desc = this.getSpellDescription("renew");
            availableSpells.push(`<button onclick="if (window.game && window.game.spellManager) window.game.spellManager.unlock('renew'); else console.log('window.game or spellManager undefined');">${desc}</button>`);
          }
          if (!this.spellManager.spells.greaterHeal.enabled && this.spellManager.spells.heal.enabled) {
            const desc = this.getSpellDescription("greaterHeal");
            availableSpells.push(`<button onclick="if (window.game && window.game.spellManager) window.game.spellManager.unlock('greaterHeal'); else console.log('window.game or spellManager undefined');">${desc}</button>`);
          }
          if (!this.spellManager.spells.chainHeal.enabled) {
            const desc = this.getSpellDescription("chainHeal");
            availableSpells.push(`<button onclick="if (window.game && window.game.spellManager) window.game.spellManager.unlock('chainHeal'); else console.log('window.game or spellManager undefined');">${desc}</button>`);
          }
          if (!this.spellManager.spells.shield.enabled) {
            const desc = this.getSpellDescription("shield");
            availableSpells.push(`<button onclick="if (window.game && window.game.spellManager) window.game.spellManager.unlock('shield'); else console.log('window.game or spellManager undefined');">${desc}</button>`);
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

    const spellBar = document.getElementById("spellBar");
    if (spellBar && this.game.state.inRound) {
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
        const canCast = spell.enabled && !this.spellManager.casting && this.game.state.mana >= spell.manaCost;
        const iconClass = canCast ? "spell-icon" : "spell-icon uncastable";
        const tooltipText = this.generateTooltipText(spell);
        spellBarHTML += `
          <div class="spell-slot" onmouseover="this.querySelector('.tooltip').style.display='block'" onmouseout="this.querySelector('.tooltip').style.display='none'">
            <img src="${spell.src}" class="${iconClass}" alt="${spell.name}">
            <div class="tooltip">${tooltipText}</div>
            <span class="mana-cost">${spell.manaCost}</span>
          </div>
        `;
      });
      spellBar.innerHTML = spellBarHTML;
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
    window.game.state.mana = Math.min(window.game.state.maxMana, window.game.state.mana + amount);
    console.log(`Debug: Added ${amount} mana, now ${window.game.state.mana}`);
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
