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
  const canvas = createCanvas(700, 400);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Teal corner accents
  const accentColor = '#00e5ff';
  const accentSize = 60;
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 6;

  // Top-left
  ctx.beginPath(); ctx.moveTo(20, 20 + accentSize); ctx.lineTo(20, 20); ctx.lineTo(20 + accentSize, 20); ctx.stroke();
  // Top-right
  ctx.beginPath(); ctx.moveTo(canvas.width - 20 - accentSize, 20); ctx.lineTo(canvas.width - 20, 20); ctx.lineTo(canvas.width - 20, 20 + accentSize); ctx.stroke();
  // Bottom-left
  ctx.beginPath(); ctx.moveTo(20, canvas.height - 20 - accentSize); ctx.lineTo(20, canvas.height - 20); ctx.lineTo(20 + accentSize, canvas.height - 20); ctx.stroke();
  // Bottom-right
  ctx.beginPath(); ctx.moveTo(canvas.width - 20 - accentSize, canvas.height - 20); ctx.lineTo(canvas.width - 20, canvas.height - 20); ctx.lineTo(canvas.width - 20, canvas.height - 20 - accentSize); ctx.stroke();

  // Member count pill
  const memberCount = member.guild.memberCount;
  const pillText = `Member #${memberCount}`;
  ctx.font = 'bold 18px sans-serif';
  const pillWidth = ctx.measureText(pillText).width + 40;
  const pillX = (canvas.width - pillWidth) / 2;
  ctx.fillStyle = '#2a2a3e';
  ctx.beginPath();
  ctx.roundRect(pillX, 25, pillWidth, 35, 17);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(pillText, canvas.width / 2, 48);

  // Profile picture
  const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
  const centerX = canvas.width / 2;
  const centerY = 190;
  const radius = 75;
  try {
    const avatar = await loadImage(avatarURL);
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, centerX - radius, centerY - radius, radius * 2, radius * 2);
    ctx.restore();
  } catch (_) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#5865f2';
    ctx.fill();
  }

  // Welcome username
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 38px sans-serif';
  ctx.fillText(`Welcome ${member.user.username}`, canvas.width / 2, 305);

  // "to"
  ctx.fillStyle = '#aaaaaa';
  ctx.font = '22px sans-serif';
  ctx.fillText('to', canvas.width / 2, 335);

  // Server name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(member.guild.name, canvas.width / 2, 370);

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

// ─── NEW MEMBER HANDLER ───────────────────────────────────────────────────────
client.on('guildMemberAdd', async member => {
  // DM
  try {
    await member.send(`👋 Welcome to **${member.guild.name}**!\n\nPlease head to **#${VERIFY_CHANNEL}** and click **Verify Me** to access the server.`);
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

client.login(TOKEN);
