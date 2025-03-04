// Game state variables
let round = 1;
let mana = 100;
let maxMana = 100;
let manaRegen = 2; // Mana per second
let roundTime = 20; // Start at 20 seconds
let lastUpdate = Date.now();
let inRound = true;
let gameStarted = false;
let spellSelected = false;
let gameEnded = false;
let casting = false;
let castProgress = 0;
let castDuration = 0;
let castTargetIndex = -1;
let castSpellType = "";
let leaderboard = [];
let targets = [
  { health: 75, maxHealth: 100, damageRate: 2, renewTime: 0 }
];
let spells = {
  lesserHeal: { enabled: true, castTime: 2, manaCost: 10, healAmount: 20 },
  heal: { enabled: false, castTime: 2.5, manaCost: 20, healAmount: 30 },
  flashHeal: { enabled: false, castTime: 1, manaCost: 15, healAmount: 40 },
  renew: { enabled: false, castTime: 0, manaCost: 25, healAmount: 50, duration: 10 }
};
let updateInterval = null;
let modifierMessage = "";
let modifierMessageTimer = 0;

// ✅ Reduce Console Logging Frequency
function globalLogSummary() {
  console.log(`GLOBAL STATUS UPDATE: 
  - Round: ${round} | Time: ${Math.ceil(roundTime)}s | Mana: ${Math.floor(mana)}/${maxMana}
  - Targets: ${targets.length}, Casting: ${casting ? castSpellType : "None"}`);

  lastGlobalLog = Date.now();
}

// ✅ Ensure Log Summary Runs Every 5 Seconds
function checkGlobalLog() {
  if (Date.now() - lastGlobalLog >= 5000) {
    globalLogSummary();
  }
}

// Leaderboard functions
async function loadLeaderboard() {
  console.log("Loading leaderboard from server...");
  try {
    const response = await fetch("leaderboard.php?action=read");
    if (!response.ok) throw new Error("Failed to load leaderboard");
    leaderboard = await response.json();
    leaderboard.sort((a, b) => b.round - a.round);
    leaderboard = leaderboard.slice(0, 10);
    console.log("Leaderboard loaded:", leaderboard);
    displayLeaderboard();
  } catch (error) {
    console.error("Error loading leaderboard:", error);
    leaderboard = [];
    displayLeaderboard();
  }
}

async function saveLeaderboard() {
  console.log("Saving leaderboard to server:", leaderboard);
  try {
    const response = await fetch("leaderboard.php?action=write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(leaderboard)
    });
    if (!response.ok) throw new Error("Failed to save leaderboard");
    console.log("Leaderboard saved successfully.");
  } catch (error) {
    console.error("Error saving leaderboard:", error);
  }
}

function displayLeaderboard() {
  console.log("Displaying leaderboard...");
  const list = document.getElementById("leaderboardList");
  if (!list) {
    console.error("Leaderboard list element not found! Retrying after DOM load...");
    return;
  }
  list.innerHTML = leaderboard.length > 0 
    ? leaderboard.map(entry => `<li>${entry.name}: Round ${entry.round}</li>`).join("")
    : "<li>No scores yet!</li>";
  console.log("Leaderboard displayed successfully.");
}

// Reset game state
function resetGame() {
  console.log("Resetting game state...");
  round = 1;
  mana = 100;
  maxMana = 100;
  manaRegen = 2;
  roundTime = 20;
  lastUpdate = Date.now();
  inRound = true;
  gameStarted = false;
  spellSelected = false;
  gameEnded = false;
  casting = false;
  castProgress = 0;
  castDuration = 0;
  castTargetIndex = -1;
  castSpellType = "";
  modifierMessage = "";
  modifierMessageTimer = 0;
  targets = [
    { health: 75, maxHealth: 100, damageRate: 2, renewTime: 0 }
  ];
  spells = {
    lesserHeal: { enabled: true, castTime: 2, manaCost: 10, healAmount: 20 },
    heal: { enabled: false, castTime: 2.5, manaCost: 20, healAmount: 30 },
    flashHeal: { enabled: false, castTime: 1, manaCost: 15, healAmount: 40 },
    renew: { enabled: false, castTime: 0, manaCost: 25, healAmount: 50, duration: 10 }
  };
  document.getElementById("startScreen").style.display = "flex";
  document.getElementById("gameContent").style.display = "none";
  document.getElementById("castBar").style.display = "none";
  loadLeaderboard();
  console.log("Game reset complete. Waiting for Start Game click.");
}

function startGame() {
  console.log("Starting game...");
  gameStarted = true;
  gameEnded = false;
  roundTime = 20;
  lastUpdate = Date.now();
  document.getElementById("startScreen").style.display = "none";
  document.getElementById("gameContent").style.display = "block";
  if (!updateInterval) {
    updateInterval = setInterval(updateProgress, 100);
    console.log("Update interval started:", updateInterval);
  }
  updateDisplay();
}

// ✅ Ensure Clicks Register Between Rounds
function startGame() {
  console.log("Game Started.");
  gameStarted = true;
  gameEnded = false;
  roundTime = 20;
  lastUpdate = Date.now();
  document.getElementById("startScreen").style.display = "none";
  document.getElementById("gameContent").style.display = "block";

  // ✅ Adjust Update Interval to Allow Button Clicks
  if (!updateInterval) {
    updateInterval = setInterval(updateProgress, inRound ? 100 : 200);
  }
}


function castSpell(event, targetIndex) {
  if (!gameStarted || gameEnded) {
    console.log("Cannot cast spell: gameStarted=", gameStarted, "gameEnded=", gameEnded);
    return;
  }
  if (casting) {
    console.log("Cannot cast: another spell is already being cast.");
    return;
  }
  console.log("Initiating spell cast on target", targetIndex);
  event.preventDefault();
  let target = targets[targetIndex];

  let spellType = "";
  if (event.button === 0) { // Left click
    if (event.shiftKey && spells.renew.enabled) {
      console.log("Renew cast attempted with Shift + Left Click");
      spellType = "renew";
    } else {
      spellType = spells.heal.enabled ? "heal" : "lesserHeal";
    }
  } else if (event.button === 2 && spells.flashHeal.enabled) { // Right click
    spellType = "flashHeal";
  } else {
    console.log("Spell cast failed: invalid button or spell not enabled.");
    return;
  }

  const spell = spells[spellType];
  if (mana < spell.manaCost) {
    console.log("Spell cast failed: not enough mana.");
    return;
  }
  if (target.health >= target.maxHealth && spellType !== "renew") {
    console.log("Spell cast failed: target at full health");
    return;
  }

  // Apply spell effect immediately
  mana -= spell.manaCost;
  if (spellType === "renew") {
    target.renewTime = spell.duration;
    console.log(`Renew applied to target ${targetIndex} for ${spell.duration}s`);
  } else if (spell.castTime === 0) {
    target.health = Math.min(target.maxHealth, target.health + spell.healAmount);
    console.log(`${spellType} instantly healed target ${targetIndex} for ${spell.healAmount}`);
  } else {
    // Spells with cast time
    castTargetIndex = targetIndex;
    castSpellType = spellType;
    castDuration = spell.castTime;
    castProgress = 0;
    casting = true;
    document.getElementById("castBar").style.display = "block";
  }
  
  updateDisplay();
}

function completeCast() {
  if (!casting) return;
  
  const target = targets[castTargetIndex];
  const spell = spells[castSpellType];
  
  console.log(`Completing cast of ${castSpellType} on target ${castTargetIndex}`);
  target.health = Math.min(target.maxHealth, target.health + spell.healAmount);
  
  casting = false;
  castProgress = 0;
  castDuration = 0;
  castTargetIndex = -1;
  castSpellType = "";
  document.getElementById("castBar").style.display = "none";
  updateDisplay();
}

function unlockSpell(spell) {
  console.log("Unlocking spell:", spell);
  if (spell === "heal") {
    spells.lesserHeal.enabled = false;
    spells.heal.enabled = true;
  } else {
    spells[spell].enabled = true;
  }
  spellSelected = true;
  updateDisplay();
}

function proceedToNextRound() {
  console.log("Proceeding to next round...");
  spellSelected = false;
  inRound = true;
  modifierMessage = "";
  modifierMessageTimer = 0;
  casting = false;
  castProgress = 0;
  castDuration = 0;
  castTargetIndex = -1;
  castSpellType = "";
  nextRound();
}

function nextRound() {
  console.log("Starting Round", round + 1);
  round++;
  
  roundTime = Math.min(30, 20 + Math.floor((round - 1) / 3));
  console.log("Round time set to:", roundTime, "seconds");

  if (round <= 5) {
    console.log("Using predefined round", round);
    if (round === 2) {
      targets = [
        { health: 60, maxHealth: 100, damageRate: 2, renewTime: 0 },
        { health: 60, maxHealth: 100, damageRate: 2, renewTime: 0 }
      ];
    } else if (round === 3) {
      targets = [
        { health: 50, maxHealth: 100, damageRate: 2, renewTime: 0 },
        { health: 50, maxHealth: 100, damageRate: 2, renewTime: 0 },
        { health: 50, maxHealth: 100, damageRate: 2, renewTime: 0 }
      ];
    } else if (round === 4) {
      targets = [
        { health: 40, maxHealth: 100, damageRate: 2.5, renewTime: 0 },
        { health: 40, maxHealth: 100, damageRate: 2.5, renewTime: 0 },
        { health: 40, maxHealth: 100, damageRate: 2.5, renewTime: 0 },
        { health: 40, maxHealth: 100, damageRate: 2.5, renewTime: 0 }
      ];
    } else if (round === 5) {
      targets = [
        { health: 30, maxHealth: 100, damageRate: 4, renewTime: 0 },
        { health: 50, maxHealth: 100, damageRate: 2, renewTime: 0 },
        { health: 50, maxHealth: 100, damageRate: 2, renewTime: 0 }
      ];
    }
  } else {
    console.log("Generating procedural round", round);
    const roundsPastFive = round - 5;
    const baseNumTargets = 3 + Math.floor(roundsPastFive / (round <= 9 ? 3 : 5));
    const variance = round <= 9 ? Math.floor(Math.random() * 5) - 2 : Math.floor(Math.random() * 3) - 1;
    const numTargets = Math.min(7, Math.max(3, baseNumTargets + variance));
    const tankDamageRate = 4 * Math.pow(1.08, roundsPastFive);
    const dpsDamageRate = 2 * Math.pow(1.08, roundsPastFive);
    const healerDamageRate = 1 * Math.pow(1.08, roundsPastFive);
    const baseHealth = Math.max(30, 100 * Math.pow(0.97, roundsPastFive));
    maxMana = 100 + 10 * Math.floor((round - 1) / 3);
    manaRegen = 2 + 0.2 * Math.floor((round - 1) / 5);
    mana = Math.min(maxMana, mana + maxMana * 0.5);

    let modifier = "";
    const modifierChance = round <= 9 ? 0.5 : 0.3;
    if (Math.random() < modifierChance) {
      const modifiers = round <= 9
        ? [
            { type: "highDamage", message: "High Damage Round!" },
            { type: "lowMana", message: "Low Mana Round!" },
            { type: "extraTank", message: "Extra Tank Round!" }
          ]
        : [
            { type: "highDamage", message: "High Damage Round!" },
            { type: "lowMana", message: "Low Mana Round!" },
            { type: "criticalCondition", message: "Critical Condition Round!" }
          ];
      const selectedModifier = modifiers[Math.floor(Math.random() * modifiers.length)];
      modifier = selectedModifier.type;
      modifierMessage = selectedModifier.message;
      modifierMessageTimer = 5;
    }

    targets = [];
    let addedExtraTank = false;
    for (let i = 0; i < numTargets; i++) {
      let damageRate = i === 0 ? tankDamageRate : dpsDamageRate;
      if (modifier === "extraTank" && i === 1 && !addedExtraTank) {
        damageRate = tankDamageRate;
        addedExtraTank = true;
      }
      if (round >= 10 && i === numTargets - 1) {
        damageRate = healerDamageRate;
      }
      let health = baseHealth;
      if (round <= 9) {
        const healthVariance = (Math.random() * 0.2 - 0.1) * health;
        health = Math.max(30, Math.min(100, health + healthVariance));
      }
      if (modifier === "criticalCondition" && i === Math.floor(Math.random() * numTargets)) {
        health = 10;
      }
      targets.push({
        health: health,
        maxHealth: 100,
        damageRate: damageRate,
        renewTime: 0
      });
    }

    if (modifier === "highDamage") {
      targets.forEach(target => {
        target.damageRate *= 1.2;
      });
    } else if (modifier === "lowMana") {
      manaRegen -= 0.5;
    }
  }
  updateDisplay();
}

function endGame(result) {
  console.log("Ending game:", result);
  gameEnded = true;
  if (updateInterval) {
    clearInterval(updateInterval);
    console.log("Update interval cleared:", updateInterval);
    updateInterval = null;
  }
  let playerName = prompt(`Game Over! You reached Round ${round}! Enter your name for the leaderboard:`);
  if (playerName) {
    playerName = playerName.trim().substring(0, 20);
    if (playerName) {
      leaderboard.push({ name: playerName, round: round });
      saveLeaderboard();
      displayLeaderboard();
    }
  }
  document.getElementById("talents").innerHTML = `
    <p>Game Over! You reached Round ${round}.</p>
    <button onclick="resetGame()">Play Again</button>
  `;
}

function updateDisplay() {
  if (!gameStarted) return;
  document.getElementById("status").innerHTML = inRound 
    ? `Round ${round} - Time: ${Math.ceil(roundTime)}s`
    : `Round ${round} Complete!`;
  
  const manaFill = document.getElementById("manaFill");
  const manaText = document.getElementById("manaText");
  if (manaFill && manaText) {
    manaFill.style.width = `${(mana / maxMana) * 100}%`;
    manaText.innerHTML = `${Math.floor(mana)}/${maxMana}`;
  } else {
    console.warn("Mana bar elements not found, skipping update.");
  }

  const castBar = document.getElementById("castBar");
  const castFill = document.getElementById("castFill");
  const castText = document.getElementById("castText");
  if (castBar && castFill && castText) {
    if (casting) {
      castBar.style.display = "block";
      const progressPercent = (castProgress / castDuration) * 100;
      castFill.style.width = `${progressPercent}%`;
      const remainingTime = Math.max(0, (castDuration - castProgress)).toFixed(1);
      castText.innerHTML = `Casting ${castSpellType === "heal" ? "Heal" : castSpellType === "lesserHeal" ? "Lesser Heal" : "Flash Heal"} (${remainingTime}s)...`;
    } else {
      castBar.style.display = "none";
    }
  } else {
    console.warn("Cast bar elements not found, skipping update.");
  }

  const eventMessageDiv = document.getElementById("eventMessage");
  if (eventMessageDiv) {
    eventMessageDiv.innerHTML = modifierMessage;
  } else {
    console.warn("Event message element not found, skipping update.");
  }

  let healthBarsHTML = "";
  if (inRound) {
    targets.forEach((target, i) => {
      healthBarsHTML += `
        <div class="health-bar" onmousedown="castSpell(event, ${i})" oncontextmenu="return false;">
          <div class="health-fill" id="healthFill${i}" style="width: ${(target.health / target.maxHealth) * 100}%;"></div>
          <div class="health-text" id="healthText${i}">${Math.floor(target.health)}/${target.maxHealth}</div>
        </div>
      `;
    });
  }
  const healthBars = document.getElementById("healthBars");
  if (healthBars) {
    healthBars.innerHTML = healthBarsHTML;
  } else {
    console.warn("Health bars element not found, skipping update.");
  }

  if (inRound && roundTime <= 0) {
    casting = false;
    castProgress = 0;
    castDuration = 0;
    castTargetIndex = -1;
    castSpellType = "";
    inRound = false;
    updateDisplay();
  }

  const talents = document.getElementById("talents");
  if (talents) {
    if (!inRound && !gameEnded) {
      let availableSpells = [];
      if (round < 5) {
        if (!spells.flashHeal.enabled) availableSpells.push('<button onclick="unlockSpell(\'flashHeal\')">Flash Heal (15 Mana, +40 HP)</button>');
        if (!spells.heal.enabled) availableSpells.push('<button onclick="unlockSpell(\'heal\')">Heal (20 Mana, +30 HP) - Replaces Lesser Heal</button>');
        if (!spells.renew.enabled) availableSpells.push('<button onclick="unlockSpell(\'renew\')">Renew (25 Mana, +50 HP over 10s)</button>');
      }
      
      if (availableSpells.length > 0 && !spellSelected) {
        talents.innerHTML = `
          <p>Choose a new spell:</p>
          ${availableSpells.join(" ")}
        `;
      } else {
        talents.innerHTML = `
          <p>Round ${round} Complete! Continue to the next challenge?</p>
          <button onclick="proceedToNextRound()">Next Round</button>
        `;
      }
    } else if (inRound) {
      talents.innerHTML = "";
    }
  } else {
    console.warn("Talents element not found, skipping update.");
  }

  const instructions = document.getElementById("instructions");
  if (instructions) {
    let instructionsHTML = `
      <p ${mana >= (spells.heal.enabled ? spells.heal.manaCost : spells.lesserHeal.manaCost) ? 'class="spell-available"' : 'class="spell-unavailable"'}>Left-click: ${spells.heal.enabled ? 'Heal (30 HP, 20 Mana, 2.5s)' : 'Lesser Heal (20 HP, 10 Mana, 2s)'}</p>
      ${spells.flashHeal.enabled ? `<p ${mana >= spells.flashHeal.manaCost ? 'class="spell-available"' : 'class="spell-unavailable"'}>Right-click: Flash Heal (40 HP, 15 Mana, 1s)</p>` : ''}
      ${spells.renew.enabled ? `<p ${mana >= spells.renew.manaCost ? 'class="spell-available"' : 'class="spell-unavailable"'}>Shift + Left-click: Renew (50 HP over 10s, 25 Mana, Instant)</p>` : ''}
    `;
    instructions.innerHTML = instructionsHTML;
  } else {
    console.warn("Instructions element not found, skipping update.");
  }
}

function updateProgress() {
  if (!gameStarted || gameEnded) {
    console.log("Update progress skipped: gameStarted=", gameStarted, "gameEnded=", gameEnded);
    return;
  }
  let now = Date.now();
  let timePassed = (now - lastUpdate) / 1000;
  if (inRound) {
    mana = Math.min(maxMana, mana + manaRegen * timePassed);
    roundTime -= timePassed;
    targets.forEach((target, i) => {
      target.health = Math.max(0, target.health - target.damageRate * timePassed);
      
      if (target.renewTime > 0) {
        const healPerTick = spells.renew.healAmount / spells.renew.duration;
        target.health = Math.min(
          target.maxHealth, 
          target.health + healPerTick * timePassed
        );
        target.renewTime = Math.max(0, target.renewTime - timePassed);
        console.log(`Renew tick on target ${i}: +${(healPerTick * timePassed).toFixed(1)} HP, remaining time: ${target.renewTime}s`);
      }
      
      if (round >= 10 && i === targets.length - 1) {
        for (let j = 0; j < targets.length - 1; j++) {
          targets[j].health = Math.min(targets[j].maxHealth, targets[j].health + 1 * timePassed);
        }
      }
    });

    if (targets.some(t => t.health <= 0) && !gameEnded) {
      console.log("Target health reached 0, ending game...");
      endGame("defeat");
      return;
    }

    if (casting) {
      castProgress += timePassed;
      if (castProgress >= castDuration) {
        completeCast();
      }
    }

    if (modifierMessageTimer > 0) {
      modifierMessageTimer -= timePassed;
      if (modifierMessageTimer <= 0) {
        modifierMessage = "";
        modifierMessageTimer = 0;
      }
    }
  }
  lastUpdate = now;
  updateDisplay();
}

// Wait for DOM to load before initializing
document.addEventListener("DOMContentLoaded", function() {
  console.log("DOM fully loaded, calling resetGame...");
  resetGame();
});

window.onfocus = updateProgress;
