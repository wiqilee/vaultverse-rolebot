// index.js
require('dotenv').config({ path: '.env', override: true });
const { Client, GatewayIntentBits, PermissionFlagsBits, Events } = require('discord.js');

// --- Validate Token ---
const token = process.env.TOKEN?.trim();
if (!token || !/\w+\.\w+\.\w+/.test(token)) {
  console.error('❌ TOKEN is missing or invalid in the .env file.');
  process.exit(1);
}
console.log('Token length:', token.length);
console.log('Token format appears valid.');

// Provide fetch in CommonJS if running on Node < 18 or no global fetch
const fetchCompat = global.fetch || ((...args) => import('node-fetch').then(m => m.default(...args)));

// --- Client Initialization ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers], // manage roles & nicknames
});

client.once(Events.ClientReady, () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
});

// --- Utilities ---
const parseHex = (hex) => {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return m ? `#${m[1].toLowerCase()}` : null;
};

async function ensureManageable(i, role) {
  if (!i.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('The bot does not have the **Manage Roles** permission.');
  }
  if (role) {
    if (role.managed) throw new Error('This role is managed by an integration and cannot be modified.');
    if (role.position >= i.guild.members.me.roles.highest.position) {
      throw new Error('Move the bot’s role **above** the target role in Server Settings → Roles.');
    }
  }
}

function guildSupportsRoleIcons(guild) {
  return guild.features?.includes('ROLE_ICONS');
}

// --- Invisible owner marker (keeps names clean) ---
const ZWSP = '\u200b'; // zero-width space
const ZWJ  = '\u200d'; // zero-width joiner
const SENT = ZWSP + ZWSP + ZWSP; // sentinel to locate our marker quickly

function encodeOwnerId(id) {
  // encode userId (string) into invisible bits after SENT
  const bits = BigInt(id).toString(2);
  return SENT + bits.replace(/0/g, ZWSP).replace(/1/g, ZWJ);
}
function tryDecodeOwnerId(name) {
  const at = name.lastIndexOf(SENT);
  if (at === -1) return null;
  const seq = name.slice(at + SENT.length).replace(new RegExp(`[^${ZWSP}${ZWJ}]`, 'g'), '');
  if (!seq) return null;
  const bits = seq.replace(new RegExp(ZWSP, 'g'), '0').replace(new RegExp(ZWJ, 'g'), '1');
  try { return BigInt('0b' + bits).toString(); } catch { return null; }
}
function stripMarker(name) {
  const at = name.lastIndexOf(SENT);
  return at === -1 ? name : name.slice(0, at).trimEnd();
}
function withMarker(displayName, userId) {
  return `${displayName}${encodeOwnerId(userId)}`;
}

// --- Personal role helpers (one per user) ---
function legacySuffix(userId) {
  return `• ${userId}`;
}

function getUserPersonalRoles(guild, userId) {
  const suf = legacySuffix(userId);
  return guild.roles.cache
    .filter(r => {
      if (r.managed || typeof r.name !== 'string') return false;
      const decoded = tryDecodeOwnerId(r.name);
      return decoded === userId || r.name.endsWith(suf);
    })
    .sort((a, b) => b.position - a.position); // highest first
}

async function findOrCleanUserRole(guild, userId) {
  const roles = getUserPersonalRoles(guild, userId);
  if (roles.size <= 1) return roles.first() ?? null;

  // keep the highest, remove others
  const [keep, ...dupes] = [...roles.values()];
  for (const r of dupes) {
    await r.delete(`Cleanup duplicate personal role for ${userId}`).catch(() => {});
  }
  return keep;
}

async function createPersonalRole(guild, me, displayName, color, userId, reason) {
  const role = await guild.roles.create({
    name: withMarker(displayName, userId),
    color,
    reason,
  });
  await role.setPosition(Math.max(me.roles.highest.position - 1, 1)).catch(() => {});
  return role;
}

// Nickname sanitizer
function sanitizeNick(input) {
  if (!input) return null;
  let s = String(input).trim();
  if (s.length === 0 || s.length > 32) return null; // Discord limit
  s = s.replace(/@everyone|@here/g, '[mention]');
  return s;
}

// --- Slash Command Handler ---
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isChatInputCommand()) return;

  try {
    // /customrole — single personal role per user; optional target; auto-assign; nickname sync; clean name
    if (i.commandName === 'customrole') {
      const displayName = i.options.getString('name', true);
      const color       = parseHex(i.options.getString('color', true));
      const target      = i.options.getUser('target') ?? i.user;

      if (!color) {
        return i.reply({ content: '❌ Invalid hex color. Example: `#00ffaa`', ephemeral: true });
      }

      await ensureManageable(i);
      await i.deferReply({ ephemeral: true });

      // If assigning to someone else, the caller must have Manage Roles
      if (target.id !== i.user.id) {
        const caller = await i.guild.members.fetch(i.user.id);
        if (!caller.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return i.editReply('❌ You need the **Manage Roles** permission to assign a role to another member.');
        }
      }

      // Optional icon
      let iconBuf;
      const att = i.options.getAttachment('icon');
      if (att && guildSupportsRoleIcons(i.guild)) {
        const res = await fetchCompat(att.url);
        if (!res.ok) throw new Error(`Failed to fetch icon (HTTP ${res.status})`);
        const ab = await res.arrayBuffer();
        iconBuf = Buffer.from(ab);
      }

      const me = await i.guild.members.fetchMe();
      const member = await i.guild.members.fetch(target.id);

      // Find or create a single personal role for this user
      let role = await findOrCleanUserRole(i.guild, target.id);

      if (!role) {
        role = await createPersonalRole(
          i.guild,
          me,
          displayName,
          color,
          target.id,
          `Created via /customrole by ${i.user.tag} for ${target.tag}`
        );
      } else {
        // Migrate legacy name -> clean name with invisible marker
        const currentDisplay = stripMarker(role.name).replace(new RegExp(`${legacySuffix(target.id)}$`), '').trimEnd();
        const desiredName = withMarker(displayName, target.id);
        if (role.name !== desiredName) {
          await role.edit({
            name: desiredName,
            color,
            ...(iconBuf ? { icon: iconBuf } : {}),
            reason: `Updated via /customrole by ${i.user.tag} for ${target.tag}`,
          });
        } else {
          await role.setColor(color);
          if (iconBuf) await role.setIcon(iconBuf).catch(() => {});
        }
      }

      // Ensure the role is assigned
      if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role, 'Ensure personal role is assigned');
      }

      // Try to sync nickname to the display name (requires Manage Nicknames & hierarchy)
      try {
        const canManageNicks = i.guild.members.me.permissions.has(PermissionFlagsBits.ManageNicknames);
        if (canManageNicks && member.manageable) {
          const nick = sanitizeNick(displayName);
          if (nick) await member.setNickname(nick, 'Sync nickname to custom role display name');
        }
      } catch {
        // Ignore nickname failures silently
      }

      const who = (target.id === i.user.id) ? 'you' : `<@${target.id}>`;
      return i.editReply(`✅ Personal role <@&${role.id}> is now **${displayName}** with color **${color}**, assigned to ${who}. If it isn’t visible yet, press **Ctrl+R** to refresh Discord.`);
    }

    // /edit-customrole (still generic editor)
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
        const res = await fetchCompat(att.url);
        if (!res.ok) throw new Error(`Failed to fetch icon (HTTP ${res.status})`);
        const ab = await res.arrayBuffer();
        iconBuf = Buffer.from(ab);
      }

      // If the role has our invisible marker, preserve owner id when renaming
      let newName = name;
      const ownerId = tryDecodeOwnerId(role.name);
      if (name && ownerId) {
        newName = withMarker(name, ownerId);
      }

      await role.edit({
        ...(newName ? { name: newName } : {}),
        ...(color   ? { color } : {}),
        ...(iconBuf ? { icon: iconBuf } : {}),
        reason: `Edited via /edit-customrole by ${i.user.tag}`,
      });

      return i.editReply(`✏️ Role <@&${role.id}> has been updated.`);
    }

    // /delete-customrole
    if (i.commandName === 'delete-customrole') {
      const role = i.options.getRole('role', true);
      await ensureManageable(i, role);
      await i.deferReply({ ephemeral: true });

      await role.delete(`Deleted via /delete-customrole by ${i.user.tag}`);
      return i.editReply('🗑️ Role has been deleted.');
    }

    // /color — updates the same personal role (clean name; no new roles)
    if (i.commandName === 'color') {
      await i.deferReply({ ephemeral: true });

      const me = await i.guild.members.fetchMe();
      if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return i.editReply('❌ The bot requires the **Manage Roles** permission.');
      }

      const chosen = i.options.getString('preset');
      const rawHex = i.options.getString('hex');
      const hex = parseHex(rawHex || chosen);
      if (!hex) return i.editReply('❌ Please provide a valid color: choose a preset or enter a 6-digit hex (e.g., `#12abef`).');

      // Find (and dedupe) the user's personal role
      let role = await findOrCleanUserRole(i.guild, i.user.id);

      if (!role) {
        role = await createPersonalRole(
          i.guild,
          me,
          'Vault Role',
          hex,
          i.user.id,
          `Personal color for ${i.user.tag}`
        );
      } else {
        await role.setColor(hex);
        // If this is a legacy name with " • <id>", migrate it to clean name with marker
        const legacy = role.name.endsWith(legacySuffix(i.user.id));
        if (legacy) {
          const clean = stripMarker(role.name).replace(new RegExp(`${legacySuffix(i.user.id)}$`), '').trimEnd();
          await role.setName(withMarker(clean || 'Vault Role', i.user.id)).catch(() => {});
        }
      }

      // Ensure it’s assigned
      const member = await i.guild.members.fetch(i.user.id);
      if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role);
      }

      await i.editReply(`✅ Your personal role color is now **${hex}**. If it’s not visible yet, press **Ctrl+R** to refresh Discord.`);
    }

    // /nick — set/reset nickname with optional target
    if (i.commandName === 'nick') {
      await i.deferReply({ ephemeral: true });

      const me = await i.guild.members.fetchMe();
      if (!me.permissions.has(PermissionFlagsBits.ManageNicknames)) {
        return i.editReply('❌ The bot requires the **Manage Nicknames** permission.');
      }

      const sub = i.options.getSubcommand();
      const targetUser = i.options.getUser('target') ?? i.user;

      // If changing someone else, the caller must have Manage Nicknames
      if (targetUser.id !== i.user.id) {
        const caller = await i.guild.members.fetch(i.user.id);
        if (!caller.permissions.has(PermissionFlagsBits.ManageNicknames)) {
          return i.editReply('❌ You need the **Manage Nicknames** permission to change another member’s nickname.');
        }
      }

      const member = await i.guild.members.fetch(targetUser.id);
      if (!member.manageable) {
        return i.editReply('❌ I cannot change that member’s nickname due to role hierarchy.');
      }

      if (sub === 'set') {
        const raw = i.options.getString('name', true);
        const nick = sanitizeNick(raw);
        if (!nick) {
          return i.editReply('❌ Invalid nickname. It must be 1–32 characters and not include mass mentions.');
        }

        try {
          await member.setNickname(nick, `Requested via /nick by ${i.user.tag}`);
          const who = (targetUser.id === i.user.id) ? 'your' : `${targetUser.username}'s`;
          return i.editReply(`✅ Successfully set ${who} nickname to **${nick}**.`);
        } catch (err) {
          console.error(err);
          return i.editReply('❌ Failed to set nickname (permission or hierarchy issue).');
        }
      }

      if (sub === 'reset') {
        try {
          await member.setNickname(null, `Requested via /nick reset by ${i.user.tag}`);
          const who = (targetUser.id === i.user.id) ? 'your' : `${targetUser.username}'s`;
          return i.editReply(`✅ Successfully reset ${who} nickname.`);
        } catch (err) {
          console.error(err);
          return i.editReply('❌ Failed to reset nickname (permission or hierarchy issue).');
        }
      }
    }

  } catch (err) {
    console.error(err);
    const msg = `❌ ${err?.message || 'An unexpected error occurred.'}`;
    if (i.deferred || i.replied) return i.editReply(msg);
    return i.reply({ content: msg, ephemeral: true });
  }
});

process.on('unhandledRejection', (e) => console.error('UNHANDLED_REJECTION:', e));
process.on('uncaughtException', (e) => console.error('UNCAUGHT_EXCEPTION:', e));

client.login(token);
