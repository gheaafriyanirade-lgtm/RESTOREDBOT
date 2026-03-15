const { Client, GatewayIntentBits, Partials, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

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
  // Send DM
  try {
    await member.send(
      `👋 Welcome to **${member.guild.name}**!\n\n` +
      `Please head to **#${VERIFY_CHANNEL}** and click **Verify Me** to access the server.`
    );
  } catch (_) {}

  // Send welcome embed in #welcome
  try {
    const welcomeChannel = member.guild.channels.cache.find(
      c => c.name === WELCOME_CHANNEL && c.type === ChannelType.GuildText
    );
    if (!welcomeChannel) return;

    const memberCount = member.guild.memberCount;
    const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });

    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x00e5ff) // teal — matches the Sapphire card style
      .setTitle(`Welcome to ${member.guild.name}!`)
      .setDescription(
        `## 👋 Welcome, <@${member.user.id}>!\n\n` +
        `You are member **#${memberCount}**.\n\n` +
        `Please head to <#${member.guild.channels.cache.find(c => c.name === VERIFY_CHANNEL)?.id}> to verify and access the server.`
      )
      .setThumbnail(avatarURL)
      .setImage(member.guild.bannerURL({ size: 1024 }) || null)
      .setFooter({ text: `Member #${memberCount}` })
      .setTimestamp();

    await welcomeChannel.send({
      content: `<@${member.user.id}>`,
      embeds: [welcomeEmbed],
    });

    console.log(`👋 Welcome card sent for ${member.user.tag}`);
  } catch (err) {
    console.error('Welcome card error:', err);
  }
});

client.login(TOKEN);
