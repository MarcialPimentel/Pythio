// Game state variables
let round = 1;
let mana = 100;
let maxMana = 100;
let manaRegen = 2; // Mana per second
let roundTime = 30;
let lastUpdate = Date.now();
let inRound = true;
let gameStarted = false;
let spellSelected = false;
let gameEnded = false;
let leaderboard = [];
let targets = [
  { health: 75, maxHealth: 100, damageRate: 2, renewTime: 0 }
];
let spells = {
  lesserHeal: true,
  flashHeal: false,
  heal: false,
  renew: false
};
let updateInterval = null;
let modifierMessage = "";
let modifierMessageTimer = 0;

// Leaderboard functions (server-side)
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
  roundTime = 30;
  lastUpdate = Date.now();
  inRound = true;
  gameStarted = false;
  spellSelected = false;
  gameEnded = false;
  modifierMessage = "";
  modifierMessageTimer = 0;
  targets = [
    { health: 75, maxHealth: 100, damageRate: 2, renewTime: 0 }
  ];
  spells = {
    lesserHeal: true,
    flashHeal: false,
    heal: false,
    renew: false
  };
  document.getElementById("startScreen").style.display = "flex";
  document.getElementById("gameContent").style.display = "none";
  loadLeaderboard();
  console.log("Game reset complete. Waiting for Start Game click.");
}

function startGame() {
  console.log("Starting game...");
  gameStarted = true;
  gameEnded = false;
  document.getElementById("startScreen").style.display = "none";
  document.getElementById("gameContent").style.display = "block";
  if (!updateInterval) {
    updateInterval = setInterval(updateProgress, 1000);
    console.log("Update interval started:", updateInterval);
  }
  updateDisplay();
}

function castSpell(event, targetIndex) {
  if (!gameStarted || gameEnded) {
    console.log("Cannot cast spell: gameStarted=", gameStarted, "gameEnded=", gameEnded);
    return;
  }
  console.log("Casting spell on target", targetIndex);
  event.preventDefault();
  let target = targets[targetIndex];
  if (event.button === 0 && !event.shiftKey && mana >= (spells.heal ? 20 : 10) && target.health < target.maxHealth) {
    console.log(`${spells.heal ? "Heal" : "Lesser Heal"} cast on target ${targetIndex}`);
    mana -= spells.heal ? 20 : 10;
    target.health = Math.min(target.maxHealth, target.health + (spells.heal ? 30 : 20));
  } else if (event.button === 2 && spells.flashHeal && mana >= 15 && target.health < target.maxHealth) {
    console.log("Flash Heal cast on target", targetIndex);
    mana -= 15;
    target.health = Math.min(target.maxHealth, target.health + 40);
  } else if (event.button === 0 && event.shiftKey && spells.renew && mana >= 25 && target.health < target.maxHealth && target.renewTime <= 0) {
    console.log("Renew cast on target", targetIndex);
    mana -= 25;
    target.renewTime = 10;
  } else {
    console.log("Spell cast failed: button=", event.button, "shiftKey=", event.shiftKey, "mana=", mana);
  }
  updateDisplay();
}

function unlockSpell(spell) {
  console.log("Unlocking spell:", spell);
  if (spell === "heal") {
    spells.lesserHeal = false;
    spells.heal = true;
  } else {
    spells[spell] = true;
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
  nextRound();
}

function nextRound() {
  console.log("Starting Round", round + 1);
  round++;
  
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
    const baseNumTargets = 3 + Math.floor(roundsPastFive / 5);
    const variance = Math.floor(Math.random() * 3) - 1; // -1, 0, or +1
    const numTargets = Math.min(7, Math.max(3, baseNumTargets + variance));
    const tankDamageRate = 4 * Math.pow(1.08, roundsPastFive);
    const dpsDamageRate = 2 * Math.pow(1.08, roundsPastFive);
    const healerDamageRate = 1 * Math.pow(1.08, roundsPastFive);
    const startingHealth = Math.max(30, 100 * Math.pow(0.97, roundsPastFive));
    maxMana = 100 + 10 * Math.floor((round - 1) / 3);
    manaRegen = 2 + 0.2 * Math.floor((round - 1) / 5);
    mana = Math.min(maxMana, mana + maxMana * 0.5);

    let modifier = "";
    if (Math.random() < 0.3) {
      const modifiers = [
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
    for (let i = 0; i < numTargets; i++) {
      let damageRate = i === 0 ? tankDamageRate : dpsDamageRate;
      if (round >= 10 && i === numTargets - 1) {
        damageRate = healerDamageRate;
      }
      let health = startingHealth;
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
  console.log("Updating display: round=", round, "inRound=", inRound, "gameEnded=", gameEnded);
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
    inRound = false;
    updateDisplay();
  }

  const talents = document.getElementById("talents");
  if (talents) {
    if (!inRound && !gameEnded) {
      let availableSpells = [];
      if (round < 5) {
        if (!spells.flashHeal) availableSpells.push('<button onclick="unlockSpell(\'flashHeal\')">Flash Heal (15 Mana, +40 HP)</button>');
        if (!spells.heal) availableSpells.push('<button onclick="unlockSpell(\'heal\')">Heal (20 Mana, +30 HP) - Replaces Lesser Heal</button>');
        if (!spells.renew) availableSpells.push('<button onclick="unlockSpell(\'renew\')">Renew (25 Mana, +50 HP over 10s)</button>');
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
    } else if (targets.some(t => t.health <= 0) && !gameEnded) {
      endGame("defeat");
    } else if (inRound) {
      talents.innerHTML = "";
    }
  } else {
    console.warn("Talents element not found, skipping update.");
  }

  const instructions = document.getElementById("instructions");
  if (instructions) {
    let instructionsHTML = `
      <p ${mana >= (spells.heal ? 20 : 10) ? 'class="spell-available"' : 'class="spell-unavailable"'}>Left-click: ${spells.heal ? 'Heal (30 HP, 20 Mana)' : 'Lesser Heal (20 HP, 10 Mana)'}</p>
      ${spells.flashHeal ? `<p ${mana >= 15 ? 'class="spell-available"' : 'class="spell-unavailable"'}>Right-click: Flash Heal (40 HP, 15 Mana)</p>` : ''}
      ${spells.renew ? `<p ${mana >= 25 ? 'class="spell-available"' : 'class="spell-unavailable"'}>Shift+click: Renew (50 HP over 10s, 25 Mana)</p>` : ''}
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
  console.log("Updating progress: roundTime=", roundTime, "mana=", mana);
  let now = Date.now();
  let timePassed = (now - lastUpdate) / 1000;
  if (inRound) {
    mana = Math.min(maxMana, mana + manaRegen * timePassed);
    roundTime -= timePassed;
    targets.forEach((target, i) => {
      console.log(`Target ${i} health before: ${target.health}, damageRate: ${target.damageRate}, timePassed: ${timePassed}`);
      target.health = Math.max(0, target.health - target.damageRate * timePassed);
      console.log(`Target ${i} health after: ${target.health}`);
      if (target.renewTime > 0) {
        console.log(`Applying Renew heal to target ${i}...`);
        target.health = Math.min(target.maxHealth, target.health + 5 * timePassed);
        target.renewTime -= timePassed;
      }
      if (round >= 10 && i === targets.length - 1) {
        for (let j = 0; j < targets.length - 1; j++) {
          targets[j].health = Math.min(targets[j].maxHealth, targets[j].health + 1 * timePassed);
        }
      }
    });

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
