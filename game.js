// Game state variables
let round = 1;
let mana = 100;
let maxMana = 100;
let manaRegen = 3; // 3 mana/second for early rounds
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
let lastGlobalLog = Date.now();

// Debounce function to limit updateDisplay calls
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
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
  const list = document.getElementById("leaderboardList");
  if (!list) {
    console.error("Leaderboard list element not found!");
    return;
  }
  list.innerHTML = leaderboard.length > 0 
    ? leaderboard.map(entry => `<li>${entry.name}: Round ${entry.round}</li>`).join("")
    : "<li>No scores yet!</li>";
}

// Reset game state
function resetGame() {
  console.log("Resetting game state...");
  round = 1;
  mana = 100;
  maxMana = 100;
  manaRegen = 3;
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
  lastGlobalLog = Date.now();
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
  if (updateInterval) clearInterval(updateInterval);
  updateInterval = null;
  loadLeaderboard();
  updateDisplay();
}

function startGame() {
  console.log("Starting game...");
  gameStarted = true;
  gameEnded = false;
  roundTime = 20; // Fresh timer for Round 1
  lastUpdate = Date.now();
  lastGlobalLog = Date.now();
  document.getElementById("startScreen").style.display = "none";
  document.getElementById("gameContent").style.display = "block";
  if (!updateInterval) {
    updateInterval = setInterval(updateProgress, 100);
  }
  updateDisplay();
}

function castSpell(event, targetIndex) {
  if (!gameStarted || gameEnded) {
    console.log("Cannot cast: game not active");
    return;
  }
  if (casting) {
    console.log("Cannot cast: already casting");
    return;
  }
  event.preventDefault();
  let target = targets[targetIndex];

  let spellType = "";
  if (event.button === 0) { // Left click
    if (event.shiftKey && spells.renew.enabled) {
      spellType = "renew";
      console.log(`Casting ${spellType} on target ${targetIndex}`);
    } else {
      spellType = spells.heal.enabled ? "heal" : "lesserHeal";
      console.log(`Casting ${spellType} on target ${targetIndex}`);
    }
  } else if (event.button === 2 && spells.flashHeal.enabled) { // Right click
    spellType = "flashHeal";
    console.log(`Casting ${spellType} on target ${targetIndex}`);
  } else {
    console.log("Spell cast failed: invalid input or spell not enabled");
    return;
  }

  const spell = spells[spellType];
  if (mana < spell.manaCost) {
    console.log("Spell cast failed: not enough mana");
    return;
  }
  if (target.health >= target.maxHealth && spellType !== "renew") {
    console.log("Spell cast failed: target at full health");
    return;
  }

  mana -= spell.manaCost;
  if (spellType === "renew") {
    target.renewTime = spell.duration;
    console.log(`Renew applied to target ${targetIndex} for ${spell.duration}s`);
  } else if (spell.castTime === 0) {
    target.health = Math.min(target.maxHealth, target.health + spell.healAmount);
    console.log(`${spellType} healed target ${targetIndex} for ${spell.healAmount}`);
  } else {
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
  
  console.log(`Completed cast of ${castSpellType} on target ${castTargetIndex}`);
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
  console.log(`Unlocking spell: ${spell}`);
  if (spell === "heal") {
    spells.lesserHeal.enabled = false;
    spells.heal.enabled = true;
  } else {
    spells[spell].enabled = true;
  }
  spellSelected = true;
  debouncedUpdateDisplay();
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
  lastUpdate = Date.now(); // Reset timing for fresh start
  if (!updateInterval) {
    updateInterval = setInterval(updateProgress, 100);
  }
  nextRound();
}

function nextRound() {
  console.log(`Starting Round ${round + 1}`);
  round++;

  // Scale round time dynamically for pacing
  roundTime = Math.min(30, 20 + Math.floor((round - 1) / 3));

  // Set base values for health, damage, and number of targets
  let baseHealth = 100;
  let baseDamageRate = 2;
  let numTargets = 1;

  // 🔹 **Round 1-3: Tutorial Phase**
  if (round === 1) {
    numTargets = 1;
    baseHealth = 75;
    baseDamageRate = 1;
    manaRegen = 4;  // High mana regen to teach spell usage
  } else if (round === 2) {
    numTargets = 2;
    baseHealth = 80;
    baseDamageRate = 1.5;
    manaRegen = 3.5;
  } else if (round === 3) {
    numTargets = 2;
    baseHealth = 90;
    baseDamageRate = 2;
    manaRegen = 3;
  }
  // 🔹 **Round 4-5: Transition Phase**
  else if (round === 4) {
    numTargets = 3;
    baseHealth = 95;
    baseDamageRate = 2.5;
    manaRegen = 2.8;
  } else if (round === 5) {
    numTargets = 4;
    baseHealth = 100;
    baseDamageRate = 3;
    manaRegen = 2.5;
  }
  // 🔹 **Round 6+: Procedural Scaling**
  else {
    const roundsPastFive = round - 5;
    numTargets = Math.min(7, 3 + Math.floor(roundsPastFive / (round <= 9 ? 3 : 5)));
    
    const tankDamageRate = 4 * Math.pow(1.08, roundsPastFive);
    const dpsDamageRate = 2 * Math.pow(1.08, roundsPastFive);
    const healerDamageRate = 1 * Math.pow(1.08, roundsPastFive);
    baseHealth = Math.max(30, 100 * Math.pow(0.97, roundsPastFive));

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
      targets.forEach(target => target.damageRate *= 1.2);
    } else if (modifier === "lowMana") {
      manaRegen -= 0.5;
    }
  }

  // Ensure early rounds still feel meaningful
  if (round < 6) {
    targets = Array.from({ length: numTargets }, () => ({
      health: baseHealth,
      maxHealth: 100,
      damageRate: baseDamageRate,
      renewTime: 0
    }));
  }

  updateDisplay();
}


function endGame(result) {
  console.log(`Game ended: ${result}, reached Round ${round}`);
  gameEnded = true;
  if (updateInterval) {
    clearInterval(updateInterval);
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
  updateDisplay();
}

// Debounced version of updateDisplay
const debouncedUpdateDisplay = debounce(updateDisplay, 50);

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
  }

  const eventMessageDiv = document.getElementById("eventMessage");
  if (eventMessageDiv) eventMessageDiv.innerHTML = modifierMessage;

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
  if (healthBars) healthBars.innerHTML = healthBarsHTML;

  if (inRound && roundTime <= 0) {
    casting = false;
    castProgress = 0;
    castDuration = 0;
    castTargetIndex = -1;
    castSpellType = "";
    inRound = false;
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
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
  }

  const instructions = document.getElementById("instructions");
  if (instructions) {
    let instructionsHTML = `
      <p ${mana >= (spells.heal.enabled ? spells.heal.manaCost : spells.lesserHeal.manaCost) ? 'class="spell-available"' : 'class="spell-unavailable"'}>Left-click: ${spells.heal.enabled ? 'Heal (30 HP, 20 Mana, 2.5s)' : 'Lesser Heal (20 HP, 10 Mana, 2s)'}</p>
      ${spells.flashHeal.enabled ? `<p ${mana >= spells.flashHeal.manaCost ? 'class="spell-available"' : 'class="spell-unavailable"'}>Right-click: Flash Heal (40 HP, 15 Mana, 1s)</p>` : ''}
      ${spells.renew.enabled ? `<p ${mana >= spells.renew.manaCost ? 'class="spell-available"' : 'class="spell-unavailable"'}>Shift + Left-click: Renew (50 HP over 10s, 25 Mana, Instant)</p>` : ''}
    `;
    instructions.innerHTML = instructionsHTML;
  }
}

function updateProgress() {
  if (!gameStarted || gameEnded || !inRound) return;

  let now = Date.now();
  let timePassed = (now - lastUpdate) / 1000;
  
  mana = Math.min(maxMana, mana + manaRegen * timePassed);
  roundTime -= timePassed;
  targets.forEach((target, i) => {
    target.health = Math.max(0, target.health - target.damageRate * timePassed);
    
    if (target.renewTime > 0) {
      const healPerTick = spells.renew.healAmount / spells.renew.duration;
      target.health = Math.min(target.maxHealth, target.health + healPerTick * timePassed);
      target.renewTime = Math.max(0, target.renewTime - timePassed);
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

  if (now - lastGlobalLog >= 5000) {
    console.log(`Game Status: Round ${round}, Time: ${Math.ceil(roundTime)}s, Mana: ${Math.floor(mana)}/${maxMana}, Regen: ${manaRegen.toFixed(1)}/s, Targets: ${targets.map(t => Math.floor(t.health)).join(", ")}`);
    lastGlobalLog = now;
  }

  lastUpdate = now;
  updateDisplay();
}

// Wait for DOM to load before initializing
document.addEventListener("DOMContentLoaded", function() {
  console.log("DOM fully loaded, calling resetGame...");
  resetGame();
});

window.onfocus = function() {
  if (inRound && gameStarted && !gameEnded) updateProgress();
};
