# CRACKUP: Protocol Eclipse

**8-Player Real-Time Online Co-op & Competitive Augmented-Agent Open-City Action RPG**  
*Inspired by Crackdown — Built with an Authoritative Node.js 20Hz WebSocket Server & HTML5 2.5D Vertical City Engine*

---

## 🚀 Quick Start (Local & Cross-Country Internet Play)

First, make sure your terminal is inside the project directory:

```powershell
cd C:\Users\travi\Documents\Python_Projects\crackup
```

### Option A: Instant Cross-Country Internet Link (Hosted From Your PC, Zero Router Config)
```powershell
npm run host:online
```
This launches the 8-player WebSocket server **and** automatically opens a free public `https://` + `wss://` tunnel (`localhost.run` / `Pinggy` via Windows OpenSSH). It prints a shareable URL in your terminal and enables the in-game **`🌐 INVITE FRIENDS`** button—send that link to up to 7 friends anywhere in the country and they can log in immediately from their browser!

### Option B: Local / LAN Server + Critic Verification
```powershell
# Start the authoritative 8-player WebSocket server on http://localhost:3000
npm start

# Run the automated 8-Client Adversarial Critic Verification Suite (11/11 checks)
npm run test:critic
```

Open `http://localhost:3000` in up to 8 browser tabs or across friends' machines!

---

## ☁️ One-Click Cloud Deployment (Railway & Render)

This repository includes production-ready deployment manifests out of the box:
- **Docker**: [`Dockerfile`](file:///c:/Users/travi/Documents/Python_Projects/crackup/Dockerfile) & [`.dockerignore`](file:///c:/Users/travi/Documents/Python_Projects/crackup/.dockerignore)
- **Railway**: [`railway.json`](file:///c:/Users/travi/Documents/Python_Projects/crackup/railway.json) (Healthcheck at `/api/health`)
- **Render**: [`render.yaml`](file:///c:/Users/travi/Documents/Python_Projects/crackup/render.yaml) (With persistent disk mounted at `/var/data` for Agent accounts & leaderboards)

---

## 🎮 Core Systems & PRD Traceability

See [`PRD.md`](file:///c:/Users/travi/Documents/Python_Projects/crackup/PRD.md) for the full Product Requirements Document:
1. **8-Player Real-Time WebSocket Architecture**: Authoritative 20Hz (`50ms`) server loop (`server/index.js`, `server/ws_server.js`) with persistent Agent Callsign + PIN login (`server/persistence.js`).
2. **7 Core Levellable Skills**: *Agility, Strength, Driving, Shooting, Explosives, Flying, Vigilante* (Levels 1–5).
3. **5 Augment Classes & 20-Node Skill Tree**: *Titan Juggernaut, Phantom Sharpshooter, Aero-Valkyrie, Demolition Savant, Pack Vanguard*.
4. **Targeted Body-Part Aiming (`1` Head, `2` Torso, `3` Arms, `4` Legs)**: Inflicts *Blinded/Stagger*, *Armor Cracked*, *Disarmed (-50% Dmg)*, and *Crippled (-70% Speed)*.
5. **Melee Combat & Escalating Timed Counter System (`F` Melee, `Q` Counter-Parry)**: Counter enemy telegraph windups and break enemy Counter Stances; evolves with Strength & Agility.
6. **Transparent vs. Secret Background Progression ("Neural Drift")**: Silently tracks collateral damage, surgical limb cripples, airborne isolation, and squad/bounty mercy—triggering emergent positive and negative mutations (*Pyro-Neurosis, Surgical Synapse, Hollow-Bone Avian Drift, Ghost Conscience*).
7. **64 Environmental Orbs**: 50 Rooftop/Ledge Agility Orbs (`z=25m..220m`), 8 dynamic fleeing Renegade Orbs, and 6 Whisper Lore Orbs.
8. **Rare High-Stakes Omega Bounties**: Server-wide timed extraction targets requiring teamwork and leg-crippling shots.
9. **Meaningful District Loop Progression**: 4 Sectors with 3-stage loops that permanently unlock the *Grapple-Hook Slingshot (`G`)*, *Siege Armory*, *Grav-Flight Overdrive*, and *Protocol Eclipse Override*.
10. **Meaningful Prototype Relic Side Quests**: Triangulate (`T`) 4 permanent Relics including the *Chrono-Shift Anchor (`R`)* (rewinds 3 seconds of HP & position history).
11. **Cyber-Pets & Competitive Multiplayer Mini-Games**: Train pets and compete live in **Neon Pet Derby** (multiplayer race with Cheer Boosts) and **Cyber-Pit Tactical Clash**.
12. **3-Act Narrative Twist ("Are We the Bad Guys?")**: Discover that **Director Vance** (Aegis Directorate) is harvesting citizens into Orbs and using your squad against **Dr. Kaelen Voss's** Free Guard—culminating in the **Protocol Eclipse Dreadnought Raid**.

