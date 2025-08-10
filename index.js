// index.js
require('dotenv').config({ path: '.env', override: true });
const { Client, GatewayIntentBits, PermissionFlagsBits, Events } = require('discord.js');

// --- Validate token ---
const token = process.env.TOKEN?.trim();
if (!token || !/\w+\.\w+\.\w+/.test(token)) {
  console.error('❌ TOKEN is missing or invalid in the .env file.');
  process.exit(1);
}
console.log(`✅ Token OK (len=${token.length})`);

// Node <18 fetch fallback
const fetchCompat = global.fetch || ((...args) => import('node-fetch').then(m => m.default(...args)));

// --- Client ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ======================== Access control ========================
const ALLOWED_ROLE_IDS = [
  'ID_FOUNDER',     // Founder
  'ID_BACKER',      // Backer
  'ID_ELITES',      // Elites
  'ID_SUPPORTERS',  // Supporters
  'ID_MODERATOR',   // Moderator
  'ID_ADMIN',       // Admin
  // Booster (💎) is checked automatically via premiumSubscriberRole
];

// 'remove' = just remove the personal color role from the member
// 'delete' = delete the member's personal color role from the server
const REVOKE_MODE = 'remove';

function isAllowedForCustomColor(guild, member) {
  const boosterRole = guild.roles.premiumSubscriberRole; // Discord Booster role (may be null)
  const isBooster = boosterRole ? member.roles.cache.has(boosterRole.id) : false;
  const hasAllowlistedRole = member.roles.cache.some(r => ALLOWED_ROLE_IDS.includes(r.id));
  const isAdminPerm = member.permissions.has(PermissionFlagsBits.Administrator);
  return isBooster || hasAllowlistedRole || isAdminPerm;
}
// =================================================================

// --- Utils ---
const parseHex = (hex) => {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return m ? `#${m[1].toLowerCase()}` : null;
};

async function ensureManageable(i, role) {
  if (!i.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('I need the **Manage Roles** permission.');
  }
  if (role) {
    if (role.managed) throw new Error('That role is managed by an integration and cannot be edited.');
    if (role.position >= i.guild.members.me.roles.highest.position) {
      throw new Error('Move my bot role **above** the target role in Server Settings → Roles.');
    }
  }
}

function guildSupportsRoleIcons(guild) {
  return guild.features?.includes('ROLE_ICONS');
}

// Invisible owner marker (binds role to user without messy names)
const ZWSP = '\u200b'; // zero-width space
const ZWJ  = '\u200d'; // zero-width joiner
const SENT = ZWSP + ZWSP + ZWSP;

function encodeOwnerId(id) {
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

// Personal role helpers (one per user)
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
    .sort((a, b) => b.position - a.position);
}
async function findOrCleanUserRole(guild, userId) {
  const roles = getUserPersonalRoles(guild, userId);
  if (roles.size <= 1) return roles.first() ?? null;
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
function sanitizeNick(input) {
  if (!input) return null;
  let s = String(input).trim();
  if (s.length === 0 || s.length > 32) return null;
  s = s.replace(/@everyone|@here/g, '[mention]');
  return s;
}

// --- Slash command handler ---
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isChatInputCommand()) return;

  try {
    // /customrole
    if (i.commandName === 'customrole') {
      // Gate access
      const callerMember = await i.guild.members.fetch(i.user.id);
      if (!isAllowedForCustomColor(i.guild, callerMember)) {
        return i.reply({
          content: '❌ This feature is only for **Booster, Founder, Backer, Elites, Supporters, Moderator, or Admin**.',
          ephemeral: true,
        });
      }

      const displayName = i.options.getString('name', true);
      const color       = parseHex(i.options.getString('color', true));
      const target      = i.options.getUser('target') ?? i.user;
      if (!color) {
        return i.reply({ content: '❌ Invalid hex color. Example: `#00ffaa`', ephemeral: true });
      }

      await ensureManageable(i);
      await i.deferReply({ ephemeral: true });

      // If assigning to someone else, caller needs Manage Roles
      if (target.id !== i.user.id) {
        const caller = await i.guild.members.fetch(i.user.id);
        if (!caller.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return i.editReply('❌ You need **Manage Roles** to assign a role to another member.');
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

      // Find or create the user’s personal role
      let role = await findOrCleanUserRole(i.guild, target.id);

      if (!role) {
        role = await createPersonalRole(
          i.guild, me, displayName, color, target.id,
          `Created via /customrole by ${i.user.tag} for ${target.tag}`
        );
      } else {
        // Migrate legacy name -> clean marker name
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

      // Ensure assignment
      if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role, 'Assign personal role');
      }

      // Best-effort nickname sync
      try {
        if (i.guild.members.me.permissions.has(PermissionFlagsBits.ManageNicknames) && member.manageable) {
          const nick = sanitizeNick(displayName);
          if (nick) await member.setNickname(nick, 'Sync nickname to custom role display name');
        }
      } catch {}

      const who = (target.id === i.user.id) ? 'you' : `<@${target.id}>`;
      return i.editReply(`✅ Personal role <@&${role.id}> is now **${displayName}** with color **${color}**, assigned to ${who}.`);
    }

    // /color
    if (i.commandName === 'color') {
      // Gate access
      const gateMember = await i.guild.members.fetch(i.user.id);
      if (!isAllowedForCustomColor(i.guild, gateMember)) {
        return i.reply({
          content: '❌ This feature is only for **Booster, Founder, Backer, Elites, Supporters, Moderator, or Admin**.',
          ephemeral: true,
        });
      }

      await i.deferReply({ ephemeral: true });

      const me = await i.guild.members.fetchMe();
      if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return i.editReply('❌ I need the **Manage Roles** permission.');
      }

      const chosen = i.options.getString('preset');
      const rawHex = i.options.getString('hex');
      const hex = parseHex(rawHex || chosen);
      if (!hex) return i.editReply('❌ Please provide a valid color: choose a preset or enter a 6-digit hex (e.g., `#12abef`).');

      // Find (and dedupe) the user’s personal role
      let role = await findOrCleanUserRole(i.guild, i.user.id);

      if (!role) {
        role = await createPersonalRole(
          i.guild, me, 'Vault Role', hex, i.user.id,
          `Personal color for ${i.user.tag}`
        );
      } else {
        await role.setColor(hex);
        // If legacy " • <id>", migrate to clean marker format
        const legacy = role.name.endsWith(legacySuffix(i.user.id));
        if (legacy) {
          const clean = stripMarker(role.name).replace(new RegExp(`${legacySuffix(i.user.id)}$`), '').trimEnd();
          await role.setName(withMarker(clean || 'Vault Role', i.user.id)).catch(() => {});
        }
      }

      // Ensure assignment
      const member = await i.guild.members.fetch(i.user.id);
      if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role);
      }

      await i.editReply(`✅ Your personal role color is now **${hex}**.`);
    }

    // /edit-customrole
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

      // Preserve owner marker on rename
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

  } catch (err) {
    console.error(err);
    const msg = `❌ ${err?.message || 'An unexpected error occurred.'}`;
    if (i.deferred || i.replied) return i.editReply(msg);
    return i.reply({ content: msg, ephemeral: true });
  }
});

// ========= Auto-revoke: remove/delete personal color role if access is lost =========
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  try {
    const hadAccess = isAllowedForCustomColor(newMember.guild, oldMember);
    const hasAccess = isAllowedForCustomColor(newMember.guild, newMember);

    if (hadAccess && !hasAccess) {
      const role = await findOrCleanUserRole(newMember.guild, newMember.id);
      if (role) {
        if (REVOKE_MODE === 'delete') {
          const me = await newMember.guild.members.fetchMe();
          if (role.position < me.roles.highest.position && !role.managed) {
            await role.delete('Auto-revoke: lost access roles/booster');
          }
        } else {
          if (newMember.roles.cache.has(role.id)) {
            await newMember.roles.remove(role, 'Auto-revoke: lost access roles/booster');
          }
        }
      }
    }
  } catch (err) {
    console.error('Auto-revoke error:', err);
  }
});

// (Optional) one-time cleanup on startup
// Uncomment to sweep everyone once when the bot boots.
// client.once('ready', async () => {
//   try {
//     for (const [, g] of client.guilds.cache) {
//       const guild = await g.fetch();
//       const members = await guild.members.fetch();
//       for (const [, m] of members) {
//         if (!isAllowedForCustomColor(guild, m)) {
//           const role = await findOrCleanUserRole(guild, m.id);
//           if (role) {
//             if (REVOKE_MODE === 'delete') {
//               const me = await guild.members.fetchMe();
//               if (role.position < me.roles.highest.position && !role.managed) {
//                 await role.delete('Startup sweep: auto-revoke custom color');
//               }
//             } else if (m.roles.cache.has(role.id)) {
//               await m.roles.remove(role, 'Startup sweep: auto-revoke custom color');
//             }
//           }
//         }
//       }
//     }
//   } catch (e) {
//     console.error('Startup sweep error:', e);
//   }
// });

process.on('unhandledRejection', (e) => console.error('UNHANDLED_REJECTION:', e));
process.on('uncaughtException', (e) => console.error('UNCAUGHT_EXCEPTION:', e));

client.login(token);
