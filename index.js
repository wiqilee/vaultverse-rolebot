// index.js
require('dotenv').config({ path: '.env', override: true });
const { Client, GatewayIntentBits, PermissionFlagsBits, Events } = require('discord.js');

// --- Validasi token ---
const token = process.env.TOKEN?.trim();
if (!token || !/\w+\.\w+\.\w+/.test(token)) {
  console.error('❌ TOKEN di .env hilang / format salah.');
  process.exit(1);
}
console.log('Token length:', token.length);
console.log('Token format looks correct.');

// --- Client ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
});

// --- Util ---
const parseHex = (hex) => {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return m ? `#${m[1]}` : null;
};

async function ensureManageable(i, role) {
  if (!i.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('Bot tidak punya izin **Manage Roles**.');
  }
  if (role) {
    if (role.managed) throw new Error('Role ini dikelola integrasi dan tidak bisa diubah.');
    if (role.position >= i.guild.members.me.roles.highest.position) {
      throw new Error('Letakkan role bot **di atas** role target (Server Settings → Roles).');
    }
  }
}

function guildSupportsRoleIcons(guild) {
  return guild.features?.includes('ROLE_ICONS');
}

// --- Handler slash command ---
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isChatInputCommand()) return;

  try {
    if (i.commandName === 'customrole') {
      const name  = i.options.getString('name', true);
      const color = parseHex(i.options.getString('color', true));
      if (!color) return i.reply({ content: '❌ Warna hex tidak valid. Contoh: `#00ffaa`', ephemeral: true });

      await ensureManageable(i);
      await i.deferReply({ ephemeral: true });

      let iconBuf;
      const att = i.options.getAttachment('icon');
      if (att && guildSupportsRoleIcons(i.guild)) {
        const res = await fetch(att.url);
        if (!res.ok) throw new Error(`Gagal mengambil icon (HTTP ${res.status})`);
        const ab = await res.arrayBuffer();
        iconBuf = Buffer.from(ab);
      }

      const role = await i.guild.roles.create({
        name,
        color,
        mentionable: i.options.getBoolean('mentionable') ?? false,
        hoist:       i.options.getBoolean('hoist') ?? false,
        ...(iconBuf ? { icon: iconBuf } : {}),
        reason: `Created via /customrole by ${i.user.tag}`,
      });

      return i.editReply(`✅ Role <@&${role.id}> dibuat dengan warna **${color}**.`);
    }

    if (i.commandName === 'edit-customrole') {
      const role = i.options.getRole('role', true);
      await ensureManageable(i, role);
      await i.deferReply({ ephemeral: true });

      const name   = i.options.getString('name') ?? undefined;
      const parsed = parseHex(i.options.getString('color'));
      const color  = parsed ?? undefined;

      let iconBuf;
      const att = i.options.getAttachment('icon');
      if (att && guildSupportsRoleIcons(i.guild)) {
        const res = await fetch(att.url);
        if (!res.ok) throw new Error(`Gagal mengambil icon (HTTP ${res.status})`);
        const ab = await res.arrayBuffer();
        iconBuf = Buffer.from(ab);
      }

      await role.edit({
        ...(name  ? { name }  : {}),
        ...(color ? { color } : {}),
        ...(iconBuf ? { icon: iconBuf } : {}),
        reason: `Edited via /edit-customrole by ${i.user.tag}`,
      });

      return i.editReply(`✏️ Role <@&${role.id}> diperbarui.`);
    }

    if (i.commandName === 'delete-customrole') {
      const role = i.options.getRole('role', true);
      await ensureManageable(i, role);
      await i.deferReply({ ephemeral: true });

      await role.delete(`Deleted via /delete-customrole by ${i.user.tag}`);
      return i.editReply('🗑️ Role dihapus.');
    }
  } catch (err) {
    console.error(err);
    const msg = `❌ ${err?.message || 'Terjadi kesalahan.'}`;
    if (i.deferred || i.replied) return i.editReply(msg);
    return i.reply({ content: msg, ephemeral: true });
  }
});

process.on('unhandledRejection', (e) => console.error('UNHANDLED_REJECTION:', e));
process.on('uncaughtException', (e) => console.error('UNCAUGHT_EXCEPTION:', e));

// --- Login ---
client.login(token);
