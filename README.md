# VaultVerse Role Bot

A Discord bot for VaultVerse to manage custom roles, colors, and commands.

## 📌 Features
- Create and assign **custom roles** with color, optional icon, hoist, and mentionable settings.
- **Auto-assign** the role immediately after creation to the target member.
- **Role-restricted commands** — Only specific roles (**Founder, Admin, Moderator, Supporters, Elites, Backer, Booster**) can use custom role commands.
- **Easily deploy** slash commands to your server.
- **Sync nickname** (optional) so it matches the role name.
- Check token validity before running.
- Edit or delete existing custom roles.
- Personal `/color` command to set your own name color.

---

## 📦 Installation

### 1. Clone the repository
```bash
git clone https://github.com/wiqilee/vaultverse-rolebot.git
cd vaultverse-rolebot
```

### 2. Install dependencies
Make sure you have [Node.js](https://nodejs.org/) installed (version 16 or above).
```bash
npm install
```

### 3. Create `.env` file
Create a `.env` file in the root folder and add the following variables:
```env
TOKEN=your-bot-token-here
CLIENT_ID=your-discord-client-id
GUILD_ID=your-discord-server-id
```

---

## ▶️ Usage

### 1. Deploy commands to Discord
Run this once after adding or changing commands:
```bash
node deploy-commands.js
```

### 2. Start the bot
```bash
node index.js
```

### 3. Check token validity
(Optional) Check if your token is valid:
```bash
node check-token.js
```

---

## 🚀 Invite the Bot
You can invite the bot to your server using this link (replace `YOUR_CLIENT_ID` with your bot's client ID):
[Invite VaultVerse Role Bot](https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot%20applications.commands&permissions=268435456)

---

## 🛡️ .gitignore
This project uses `.gitignore` to keep sensitive files out of Git:
```
# Secret files
.env

# Node.js default modules
node_modules/

# Logs
*.log

# OS-specific files
.DS_Store
Thumbs.db
```

---

## 📄 License
This project is licensed under the MIT License — feel free to modify and use it.
