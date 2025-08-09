require('dotenv').config({ path: '.env', override: true });
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

// Debug token
console.log('DEBUG token len =', process.env.TOKEN?.trim().length);
console.log('DEBUG token head =', process.env.TOKEN?.trim().slice(0, 8));
console.log('DEBUG token tail =', process.env.TOKEN?.trim().slice(-8));

// Cek ENV
if (!process.env.TOKEN || !/\w+\.\w+\.\w+/.test(process.env.TOKEN.trim())) {
  console.error('❌ TOKEN di .env hilang atau formatnya salah.');
  process.exit(1);
}
if (!process.env.CLIENT_ID) {
  console.error('❌ CLIENT_ID di .env tidak ditemukan.');
  process.exit(1);
}
if (!process.env.GUILD_ID) {
  console.error('❌ GUILD_ID di .env tidak ditemukan.');
  process.exit(1);
}

// Definisi commands
const commands = [
  new SlashCommandBuilder()
    .setName('customrole')
    .setDescription('Create a custom role')
    .addStringOption(o => o.setName('name').setDescription('Role name').setRequired(true))
    .addStringOption(o => o.setName('color').setDescription('Hex color, e.g., #00ffaa').setRequired(true))
    .addBooleanOption(o => o.setName('mentionable').setDescription('Allow @mention'))
    .addBooleanOption(o => o.setName('hoist').setDescription('Show separately'))
    .addAttachmentOption(o => o.setName('icon').setDescription('Role icon (optional)')),

  new SlashCommandBuilder()
    .setName('edit-customrole')
    .setDescription('Edit a custom role')
    .addRoleOption(o => o.setName('role').setDescription('Role to edit').setRequired(true))
    .addStringOption(o => o.setName('name').setDescription('New name'))
    .addStringOption(o => o.setName('color').setDescription('New hex color'))
    .addAttachmentOption(o => o.setName('icon').setDescription('New icon')),

  new SlashCommandBuilder()
    .setName('delete-customrole')
    .setDescription('Delete a custom role')
    .addRoleOption(o => o.setName('role').setDescription('Role to delete').setRequired(true)),
].map(c => c.toJSON());

// REST API
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN.trim());

(async () => {
  try {
    console.log(`⏳ Registering ${commands.length} command(s) to guild ${process.env.GUILD_ID}…`);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash commands registered (guild scope).');
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
})();
