// deploy-commands.js
require('dotenv').config({ path: '.env', override: true });
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

// --- Debug token (safe preview) ---
const token = process.env.TOKEN?.trim();
console.log('DEBUG token length =', token?.length ?? 0);
console.log('DEBUG token head   =', token ? token.slice(0, 8) : 'N/A');
console.log('DEBUG token tail   =', token ? token.slice(-8) : 'N/A');

// --- Validate required envs ---
if (!token || !/\w+\.\w+\.\w+/.test(token)) {
  console.error('❌ TOKEN is missing or malformed in .env.');
  process.exit(1);
}
if (!process.env.CLIENT_ID) {
  console.error('❌ CLIENT_ID is missing in .env.');
  process.exit(1);
}
if (!process.env.GUILD_ID) {
  console.error('❌ GUILD_ID is missing in .env.');
  process.exit(1);
}

// --- Define slash commands ---
const commands = [
  // /customrole
  new SlashCommandBuilder()
    .setName('customrole')
    .setDescription('Create or update a personal custom role')
    .addStringOption(o =>
      o.setName('name').setDescription('Display name for the role').setRequired(true)
    )
    .addStringOption(o =>
      o.setName('color').setDescription('Hex color, e.g., #00ffaa').setRequired(true)
    )
    .addBooleanOption(o =>
      o.setName('mentionable').setDescription('Allow this role to be @mentioned')
    )
    .addBooleanOption(o =>
      o.setName('hoist').setDescription('Show the role separately in the member list')
    )
    .addAttachmentOption(o =>
      o.setName('icon').setDescription('Role icon (optional)')
    )
    .addUserOption(o =>
      o.setName('target').setDescription('Member to receive/update the role (optional)')
    ),

  // /edit-customrole
  new SlashCommandBuilder()
    .setName('edit-customrole')
    .setDescription('Edit an existing role')
    .addRoleOption(o =>
      o.setName('role').setDescription('Role to edit').setRequired(true)
    )
    .addStringOption(o =>
      o.setName('name').setDescription('New name')
    )
    .addStringOption(o =>
      o.setName('color').setDescription('New hex color, e.g., #12abef')
    )
    .addAttachmentOption(o =>
      o.setName('icon').setDescription('New icon')
    ),

  // /delete-customrole
  new SlashCommandBuilder()
    .setName('delete-customrole')
    .setDescription('Delete a role')
    .addRoleOption(o =>
      o.setName('role').setDescription('Role to delete').setRequired(true)
    ),

  // /color — personal name color for members (single personal role per user)
  new SlashCommandBuilder()
    .setName('color')
    .setDescription('Set your personal name color')
    .addStringOption(o =>
      o.setName('preset')
       .setDescription('Choose from preset colors')
       .addChoices(
         { name: 'White',        value: '#ffffff' },
         { name: 'Black',        value: '#000000' },
         { name: 'Hacker Green', value: '#00ff66' },
         { name: 'Cyan',         value: '#00e5ff' },
         { name: 'Purple',       value: '#9b59b6' },
         { name: 'Gold',         value: '#f1c40f' },
       )
    )
    .addStringOption(o =>
      o.setName('hex').setDescription('Custom HEX color (e.g., #12abef)')
    ),

  // /nick — set or reset server nickname
  new SlashCommandBuilder()
    .setName('nick')
    .setDescription('Set or reset a server nickname')
    .addSubcommand(sc =>
      sc.setName('set')
        .setDescription('Set a server nickname')
        .addStringOption(o =>
          o.setName('name').setDescription('New nickname (1–32 characters)').setRequired(true)
        )
        .addUserOption(o =>
          o.setName('target').setDescription('Member to rename (optional)')
        )
    )
    .addSubcommand(sc =>
      sc.setName('reset')
        .setDescription('Reset (clear) a server nickname')
        .addUserOption(o =>
          o.setName('target').setDescription('Member to reset (optional)')
        )
    ),
].map(c => c.toJSON());

// --- REST client ---
const rest = new REST({ version: '10' }).setToken(token);

// --- Deploy to a single guild (fast iteration) ---
(async () => {
  try {
    console.log(`⏳ Registering ${commands.length} command(s) to guild ${process.env.GUILD_ID}...`);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );
    console.log('✅ Slash commands registered (guild scope).');
    console.log('👉 Tip: If commands don’t appear, re-invite the bot with the applications.commands scope and try again.');
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
    process.exit(1);
  }
})();
