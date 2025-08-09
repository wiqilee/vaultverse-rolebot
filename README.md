# VaultVerse Role Bot

A Discord bot for VaultVerse to manage custom roles and commands.

## 📌 Features
- Assign custom roles to members.
- Remove roles when conditions are not met.
- Deploy slash commands automatically.
- Check token validity before running.

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
DISCORD_TOKEN=your-bot-token-here
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
(Optional) You can check whether your token is valid:
```bash
node check-token.js
```

---

## 🛡️ .gitignore
This project uses `.gitignore` to ensure sensitive files are not uploaded:
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
This project is licensed under the MIT License - feel free to modify and use it.
