const { Client, GatewayIntentBits, Partials, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits, ChannelType, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// ─── CONFIG ───────────────────────────────────────────────────────────────────
require('dotenv').config();
const TOKEN           = process.env.DISCORD_TOKEN;
const VERIFIED_ROLE   = process.env.VERIFIED_ROLE_NAME   || 'Verified';
const VERIFY_CHANNEL  = process.env.VERIFY_CHANNEL_NAME  || 'get-verify';
const WELCOME_CHANNEL = process.env.WELCOME_CHANNEL_NAME || 'welcome';
// ──────────────────────────────────────────────────────────────────────────────

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ─── SLASH COMMANDS ───────────────────────────────────────────────────────────
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('setup-verify')
    .setDescription('Sets up the verification channel and posts the verify button')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Slash commands registered.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
});

// ─── WELCOME CARD GENERATOR ───────────────────────────────────────────────────
async function createWelcomeCard(member) {
  const W = 600, H = 400;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Dark background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  // Teal corner brackets
  const teal = '#00e5ff';
  const arm = 55;
  const thick = 6;
  const pad = 18;
  ctx.strokeStyle = teal;
  ctx.lineWidth = thick;
  ctx.lineCap = 'square';

  // Top-left
  ctx.beginPath(); ctx.moveTo(pad, pad + arm); ctx.lineTo(pad, pad); ctx.lineTo(pad + arm, pad); ctx.stroke();
  // Top-right
  ctx.beginPath(); ctx.moveTo(W - pad - arm, pad); ctx.lineTo(W - pad, pad); ctx.lineTo(W - pad, pad + arm); ctx.stroke();
  // Bottom-left
  ctx.beginPath(); ctx.moveTo(pad, H - pad - arm); ctx.lineTo(pad, H - pad); ctx.lineTo(pad + arm, H - pad); ctx.stroke();
  // Bottom-right
  ctx.beginPath(); ctx.moveTo(W - pad - arm, H - pad); ctx.lineTo(W - pad, H - pad); ctx.lineTo(W - pad, H - pad - arm); ctx.stroke();

  // Member count pill
  const memberCount = member.guild.memberCount;
  const pillText = `Member #${memberCount}`;
  ctx.font = 'bold 16px Arial';
  const tw = ctx.measureText(pillText).width;
  const pillW = tw + 36, pillH = 30;
  const pillX = (W - pillW) / 2, pillY = 22;
  ctx.fillStyle = '#2c2c4a';
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 15);
  ctx.fill();
  ctx.fillStyle = '#cccccc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pillText, W / 2, pillY + pillH / 2);

  // Avatar circle
  const cx = W / 2, cy = 195, r = 70;
  try {
    const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
    const avatar = await loadImage(avatarURL);

    // White ring
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Clip & draw avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  } catch (_) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#5865f2';
    ctx.fill();
  }

  // "Welcome USERNAME"
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px Arial';
  ctx.fillText(`Welcome ${member.user.username}`, W / 2, 300);

  // "to"
  ctx.fillStyle = '#aaaaaa';
  ctx.font = '20px Arial';
  ctx.fillText('to', W / 2, 328);

  // Server name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px Arial';
  ctx.fillText(member.guild.name, W / 2, 360);

  return canvas.toBuffer('image/png');
}

// ─── /setup-verify COMMAND ────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'setup-verify') return;

  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;

  let verifiedRole = guild.roles.cache.find(r => r.name === VERIFIED_ROLE);
  if (!verifiedRole) {
    verifiedRole = await guild.roles.create({
      name: VERIFIED_ROLE,
      colors: [0x5865f2],
      reason: 'Verification role created by bot',
    });
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
  if (!verifyChannel) {
    verifyChannel = await guild.channels.create({ name: VERIFY_CHANNEL, type: ChannelType.GuildText });
  }

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
});

// ─── BUTTON CLICK HANDLER ─────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'verify_button') return;

  const guild  = interaction.guild;
  const member = interaction.member;
  const verifiedRole = guild.roles.cache.find(r => r.name === VERIFIED_ROLE);

  if (!verifiedRole) {
    await interaction.reply({ content: '⚠️ Verified role not found. Please ask an admin to run `/setup-verify`.', ephemeral: true });
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
    console.log(`✅ Verified: ${member.user.tag}`);
  } catch (err) {
    await interaction.reply({ content: '❌ Something went wrong. Make sure the bot role is above the Verified role.', ephemeral: true });
    setTimeout(async () => { try { await interaction.deleteReply(); } catch (_) {} }, 5000);
  }
});

// ─── NEW MEMBER WELCOME CARD ──────────────────────────────────────────────────
client.on('guildMemberAdd', async member => {
  // DM
  try {
    await member.send(
      `👋 Welcome to **${member.guild.name}**!\n\n` +
      `Please head to **#${VERIFY_CHANNEL}** and click **Verify Me** to access the server.`
    );
  } catch (_) {}

  // Welcome image card
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

    console.log(`👋 Welcome card sent for ${member.user.tag}`);
  } catch (err) {
    console.error('Welcome card error:', err);
  }
});

client.login(TOKEN);
