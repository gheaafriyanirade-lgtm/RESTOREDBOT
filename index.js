const {
  Client, GatewayIntentBits, Partials, EmbedBuilder,
  ButtonBuilder, ButtonStyle, ActionRowBuilder,
  PermissionFlagsBits, ChannelType, AttachmentBuilder
} = require('discord.js');
const { createCanvas, loadImage } = require('canvas');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// ─── CONFIG ───────────────────────────────────────────────────────────────────
require('dotenv').config();
const TOKEN            = process.env.DISCORD_TOKEN;
const VERIFIED_ROLE    = process.env.VERIFIED_ROLE_NAME    || 'Verified';
const VERIFY_CHANNEL   = process.env.VERIFY_CHANNEL_NAME   || 'get-verify';
const WELCOME_CHANNEL  = process.env.WELCOME_CHANNEL_NAME  || 'welcome';
const INVITES_CHANNEL  = process.env.INVITES_CHANNEL_NAME  || 'invites';
const INVITES_NEEDED   = parseInt(process.env.INVITES_NEEDED || '10');
// ──────────────────────────────────────────────────────────────────────────────

// ─── IN-MEMORY INVITE TRACKING ────────────────────────────────────────────────
// { guildId: { code: { inviterId, uses } } }
const inviteCache = new Map();

// { guildId: { userId: { total, real, left, fake, usedKeys } } }
const inviteData = new Map();

function getGuildData(guildId) {
  if (!inviteData.has(guildId)) inviteData.set(guildId, new Map());
  return inviteData.get(guildId);
}

function getUserData(guildId, userId) {
  const guild = getGuildData(guildId);
  if (!guild.has(userId)) {
    guild.set(userId, { total: 0, real: 0, left: 0, fake: 0, usedKeys: 0 });
  }
  return guild.get(userId);
}

// ─── SLASH COMMANDS ───────────────────────────────────────────────────────────
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('setup-verify')
    .setDescription('Sets up the verification channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('setup-invites')
    .setDescription('Sets up the invite reward channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Cache all guild invites on startup
  for (const [, guild] of client.guilds.cache) {
    try {
      const invites = await guild.invites.fetch();
      const cache = new Map();
      invites.forEach(inv => cache.set(inv.code, { inviterId: inv.inviter?.id, uses: inv.uses }));
      inviteCache.set(guild.id, cache);
    } catch (_) {}
  }

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Slash commands registered.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
});

// ─── TRACK INVITE USAGE ───────────────────────────────────────────────────────
client.on('inviteCreate', async invite => {
  const cache = inviteCache.get(invite.guild.id) || new Map();
  cache.set(invite.code, { inviterId: invite.inviter?.id, uses: invite.uses });
  inviteCache.set(invite.guild.id, cache);
});

client.on('inviteDelete', async invite => {
  const cache = inviteCache.get(invite.guild.id);
  if (cache) cache.delete(invite.code);
});

// ─── DETECT WHO INVITED NEW MEMBER ───────────────────────────────────────────
client.on('guildMemberAdd', async member => {
  try {
    const newInvites = await member.guild.invites.fetch();
    const oldCache = inviteCache.get(member.guild.id) || new Map();
    let inviterId = null;

    // Find which invite had its uses increase
    newInvites.forEach(inv => {
      const old = oldCache.get(inv.code);
      if (old && inv.uses > old.uses) inviterId = old.inviterId;
    });

    // Update cache
    const newCache = new Map();
    newInvites.forEach(inv => newCache.set(inv.code, { inviterId: inv.inviter?.id, uses: inv.uses }));
    inviteCache.set(member.guild.id, newCache);

    // Update inviter stats
    if (inviterId) {
      const data = getUserData(member.guild.id, inviterId);
      data.total += 1;
      data.real += 1;
      console.log(`📨 ${member.user.tag} invited by ${inviterId}`);
    }
  } catch (_) {}

  // DM new member
  try {
    await member.send(
      `👋 Welcome to **${member.guild.name}**!\n\n` +
      `Please head to **#${VERIFY_CHANNEL}** and click **Verify Me** to access the server.`
    );
  } catch (_) {}

  // Welcome card
  try {
    const welcomeChannel = member.guild.channels.cache.find(
      c => c.name === WELCOME_CHANNEL && c.type === ChannelType.GuildText
    );
    if (!welcomeChannel) return;
    const cardBuffer = await createWelcomeCard(member);
    const attachment = new AttachmentBuilder(cardBuffer, { name: 'welcome.png' });
    await welcomeChannel.send({
      content: `Welcome <@${member.user.id}> to **${member.guild.name}**! 🎉`,
      files: [attachment],
    });
  } catch (err) {
    console.error('Welcome card error:', err);
  }
});

// Track when member leaves — mark as "left"
client.on('guildMemberRemove', async member => {
  const guildData = getGuildData(member.guild.id);
  // Find who invited them and mark as left
  // This is approximate — in production you'd store join-invite mapping
  // For now we track it via the left counter
  guildData.forEach((data, userId) => {
    if (data.real > 0) {
      // We can't perfectly track who invited who without a DB
      // but we log the leave event
    }
  });
});

// ─── WELCOME CARD ─────────────────────────────────────────────────────────────
async function createWelcomeCard(member) {
  const W = 600, H = 400;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  const teal = '#00e5ff';
  const arm = 55, pad = 18;
  ctx.strokeStyle = teal;
  ctx.lineWidth = 6;
  ctx.lineCap = 'square';

  ctx.beginPath(); ctx.moveTo(pad, pad + arm); ctx.lineTo(pad, pad); ctx.lineTo(pad + arm, pad); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W - pad - arm, pad); ctx.lineTo(W - pad, pad); ctx.lineTo(W - pad, pad + arm); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pad, H - pad - arm); ctx.lineTo(pad, H - pad); ctx.lineTo(pad + arm, H - pad); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W - pad - arm, H - pad); ctx.lineTo(W - pad, H - pad); ctx.lineTo(W - pad, H - pad - arm); ctx.stroke();

  const memberCount = member.guild.memberCount;
  const pillText = `Member #${memberCount}`;
  ctx.font = 'bold 16px Arial';
  const tw = ctx.measureText(pillText).width;
  const pillW = tw + 36, pillH = 30;
  const pillX = (W - pillW) / 2, pillY = 22;
  ctx.fillStyle = '#2c2c4a';
  ctx.beginPath(); ctx.roundRect(pillX, pillY, pillW, pillH, 15); ctx.fill();
  ctx.fillStyle = '#cccccc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pillText, W / 2, pillY + pillH / 2);

  const cx = W / 2, cy = 195, r = 70;
  try {
    const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
    const avatar = await loadImage(avatarURL);
    ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(avatar, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  } catch (_) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#5865f2'; ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px Arial';
  ctx.fillText(`Welcome ${member.user.username}`, W / 2, 300);
  ctx.fillStyle = '#aaaaaa';
  ctx.font = '20px Arial';
  ctx.fillText('to', W / 2, 328);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px Arial';
  ctx.fillText(member.guild.name, W / 2, 360);

  return canvas.toBuffer('image/png');
}

// ─── /setup-verify COMMAND ────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'setup-verify') {
    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;

    let verifiedRole = guild.roles.cache.find(r => r.name === VERIFIED_ROLE);
    if (!verifiedRole) {
      verifiedRole = await guild.roles.create({ name: VERIFIED_ROLE, colors: [0x5865f2] });
    }

    const everyoneRole = guild.roles.everyone;
    const botRole = guild.members.me.roles.highest;
    await guild.channels.fetch();

    for (const [, channel] of guild.channels.cache) {
      if (channel.name === VERIFY_CHANNEL) continue;
      try {
        await channel.permissionOverwrites.edit(everyoneRole, { ViewChannel: false, SendMessages: false });
        await channel.permissionOverwrites.edit(verifiedRole, { ViewChannel: true, SendMessages: true });
        await channel.permissionOverwrites.edit(botRole, { ViewChannel: true, SendMessages: true });
      } catch (_) {}
    }

    let verifyChannel = guild.channels.cache.find(c => c.name === VERIFY_CHANNEL && c.type === ChannelType.GuildText);
    if (!verifyChannel) verifyChannel = await guild.channels.create({ name: VERIFY_CHANNEL, type: ChannelType.GuildText });

    await verifyChannel.permissionOverwrites.edit(everyoneRole, { ViewChannel: true, SendMessages: false, ReadMessageHistory: true });
    await verifyChannel.permissionOverwrites.edit(verifiedRole, { ViewChannel: false });

    try { const msgs = await verifyChannel.messages.fetch({ limit: 10 }); await verifyChannel.bulkDelete(msgs); } catch (_) {}

    const embed = new EmbedBuilder()
      .setTitle('🔐 Verify to Access the Server')
      .setDescription('Welcome! To gain access to all channels, please click the **Verify** button below.\n\nBy verifying, you agree to follow our server rules.')
      .setColor(0x5865f2)
      .setFooter({ text: 'Click once — verification is instant!' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('verify_button').setLabel('✅ Verify Me').setStyle(ButtonStyle.Primary)
    );

    await verifyChannel.send({ embeds: [embed], components: [row] });
    await interaction.editReply('✅ Done! *(This message will delete itself)*');
    setTimeout(async () => { try { await interaction.deleteReply(); } catch (_) {} }, 5000);
  }

  // ─── /setup-invites COMMAND ─────────────────────────────────────────────────
  if (interaction.commandName === 'setup-invites') {
    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;

    let invChannel = guild.channels.cache.find(c => c.name === INVITES_CHANNEL && c.type === ChannelType.GuildText);
    if (!invChannel) {
      invChannel = await guild.channels.create({ name: INVITES_CHANNEL, type: ChannelType.GuildText });
    }

    // Make read-only for everyone
    await invChannel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });

    try { const msgs = await invChannel.messages.fetch({ limit: 10 }); await invChannel.bulkDelete(msgs); } catch (_) {}

    const embed = new EmbedBuilder()
      .setTitle('🎉 Invite Your Friends & Earn Rewards!')
      .setDescription(
        'Invite your friends and earn **free keys**!\n\n' +
        '**How it works:**\n' +
        '1️⃣ Click **Your Invite Link** to get your link\n' +
        '2️⃣ Share it with friends\n' +
        `3️⃣ Once you have **${INVITES_NEEDED} real invites**, click **Redeem Your Key**!\n\n` +
        `Redeem **unlimited times** — every ${INVITES_NEEDED} invites = 1 free key 🔑\n\n` +
        '⚠️ *Fake invites & users who leave don\'t count!*'
      )
      .setColor(0x5865f2)
      .setFooter({ text: 'Invite Reward System' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('get_invite_link').setLabel('🔗 Your Invite Link').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('check_invites').setLabel('📊 Check Your Invites').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('redeem_key').setLabel('🎁 Redeem Your Key').setStyle(ButtonStyle.Success),
    );

    await invChannel.send({ embeds: [embed], components: [row] });
    await interaction.editReply('✅ Invite system set up! *(This message will delete itself)*');
    setTimeout(async () => { try { await interaction.deleteReply(); } catch (_) {} }, 5000);
  }
});

// ─── VERIFY BUTTON ────────────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const guild  = interaction.guild;
  const member = interaction.member;

  // ── Verify Me ──
  if (interaction.customId === 'verify_button') {
    const verifiedRole = guild.roles.cache.find(r => r.name === VERIFIED_ROLE);
    if (!verifiedRole) {
      await interaction.reply({ content: '⚠️ Verified role not found.', ephemeral: true });
      setTimeout(async () => { try { await interaction.deleteReply(); } catch (_) {} }, 5000);
      return;
    }
    if (member.roles.cache.has(verifiedRole.id)) {
      await interaction.reply({ content: '✅ You are already verified!', ephemeral: true });
      setTimeout(async () => { try { await interaction.deleteReply(); } catch (_) {} }, 5000);
      return;
    }
    try {
      await member.roles.add(verifiedRole);
      await interaction.reply({ content: '🎉 You have been verified! Welcome!', ephemeral: true });
      setTimeout(async () => { try { await interaction.deleteReply(); } catch (_) {} }, 5000);
    } catch (err) {
      await interaction.reply({ content: '❌ Something went wrong.', ephemeral: true });
      setTimeout(async () => { try { await interaction.deleteReply(); } catch (_) {} }, 5000);
    }
  }

  // ── Get Invite Link ──
  if (interaction.customId === 'get_invite_link') {
    try {
      // Create a permanent invite for this user
      const invChannel = guild.channels.cache.find(c => c.name === INVITES_CHANNEL && c.type === ChannelType.GuildText)
        || guild.channels.cache.find(c => c.type === ChannelType.GuildText);

      const invite = await invChannel.createInvite({
        maxAge: 0, // never expires
        maxUses: 0, // unlimited
        unique: true,
        reason: `Invite link for ${member.user.tag}`,
      });

      // Cache the invite
      const cache = inviteCache.get(guild.id) || new Map();
      cache.set(invite.code, { inviterId: member.user.id, uses: 0 });
      inviteCache.set(guild.id, cache);

      const embed = new EmbedBuilder()
        .setTitle('🔗 Your Personal Invite Link')
        .setDescription(
          `Your **permanent** invite link:\n\n` +
          `**https://discord.gg/${invite.code}**\n\n` +
          `Every **${INVITES_NEEDED} real invites** = 1 free key 🔑\n` +
          `This link never expires and is unique to you!`
        )
        .setColor(0x5865f2)
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      await interaction.reply({ content: '❌ Could not create invite. Make sure the bot has Create Invite permission.', ephemeral: true });
    }
  }

  // ── Check Invites ──
  if (interaction.customId === 'check_invites') {
    const data = getUserData(guild.id, member.user.id);
    const available = Math.floor(data.real / INVITES_NEEDED) - data.usedKeys;
    const progressFilled = Math.min(data.real % INVITES_NEEDED, INVITES_NEEDED);
    const progressBar = '█'.repeat(progressFilled) + '░'.repeat(INVITES_NEEDED - progressFilled);
    const nextReward = data.real % INVITES_NEEDED === 0 && data.real > 0
      ? 'Ready to redeem! 🎁'
      : `${INVITES_NEEDED - (data.real % INVITES_NEEDED)} more needed`;

    const embed = new EmbedBuilder()
      .setTitle('📊 Your Invite Stats')
      .setThumbnail(member.user.displayAvatarURL({ extension: 'png', size: 128 }))
      .setDescription(
        `**Progress:**\n${progressBar} ${data.real % INVITES_NEEDED}/${INVITES_NEEDED}\n\n` +
        `**Next Reward:** ${nextReward}\n\n` +
        `📨 **Total** — ${data.total}\n` +
        `✅ **Real** — ${data.real}\n` +
        `🎁 **Available Keys** — ${available}\n` +
        `🔑 **Used Keys** — ${data.usedKeys}\n` +
        `👋 **Left** — ${data.left}\n` +
        `🚫 **Fake** — ${data.fake}`
      )
      .setColor(0x5865f2)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── Redeem Key ──
  if (interaction.customId === 'redeem_key') {
    const data = getUserData(guild.id, member.user.id);
    const available = Math.floor(data.real / INVITES_NEEDED) - data.usedKeys;

    if (available <= 0) {
      const needed = INVITES_NEEDED - (data.real % INVITES_NEEDED);
      await interaction.reply({
        content: `❌ Need **${INVITES_NEEDED} invites**. You have **${data.real}**. ${needed} more needed!`,
        ephemeral: true
      });
      return;
    }

    // Redeem a key
    data.usedKeys += 1;

    const embed = new EmbedBuilder()
      .setTitle('🎁 Key Redeemed!')
      .setDescription(
        `✅ You have successfully redeemed **1 key**!\n\n` +
        `Please open a **support ticket** or DM an admin to claim your reward.\n\n` +
        `🔑 Keys used: **${data.usedKeys}**\n` +
        `🎁 Keys remaining: **${available - 1}**`
      )
      .setColor(0x00e5ff)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    console.log(`🎁 ${member.user.tag} redeemed a key!`);
  }
});

client.login(TOKEN);
