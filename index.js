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
// Set these in your .env file (see .env.example)
require('dotenv').config();
const TOKEN          = process.env.DISCORD_TOKEN;
const VERIFIED_ROLE  = process.env.VERIFIED_ROLE_NAME  || 'Verified';
const VERIFY_CHANNEL = process.env.VERIFY_CHANNEL_NAME || 'get-verify';
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

  if (interaction.commandName === 'setup-verify') {
    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;

    // 1. Create "Verified" role if it doesn't exist
    let verifiedRole = guild.roles.cache.find(r => r.name === VERIFIED_ROLE);
    if (!verifiedRole) {
      verifiedRole = await guild.roles.create({
        name: VERIFIED_ROLE,
        color: 0x5865f2,
        reason: 'Verification role created by bot',
      });
      console.log(`Created role: ${VERIFIED_ROLE}`);
    }

    // 2. Lock ALL channels from @everyone (except verify channel)
    const everyoneRole = guild.roles.everyone;
    await guild.channels.fetch();

    for (const [, channel] of guild.channels.cache) {
      if (channel.name === VERIFY_CHANNEL) continue;
      if (channel.type === ChannelType.GuildCategory) continue;
      try {
        await channel.permissionOverwrites.edit(everyoneRole, {
          ViewChannel: false,
          SendMessages: false,
        });
        await channel.permissionOverwrites.edit(verifiedRole, {
          ViewChannel: true,
          SendMessages: true,
        });
      } catch (_) {}
    }

    // 3. Find or create #get-verify channel
    let verifyChannel = guild.channels.cache.find(
      c => c.name === VERIFY_CHANNEL && c.type === ChannelType.GuildText
    );
    if (!verifyChannel) {
      verifyChannel = await guild.channels.create({
        name: VERIFY_CHANNEL,
        type: ChannelType.GuildText,
        reason: 'Verification channel',
      });
    }

    // 4. Make verify channel visible to everyone but read-only
    await verifyChannel.permissionOverwrites.edit(everyoneRole, {
      ViewChannel: true,
      SendMessages: false,
    });

    // 5. Post the verification embed + button
    const embed = new EmbedBuilder()
      .setTitle('🔐 Verify to Access the Server')
      .setDescription(
        'Welcome! To gain access to all channels, please click the **Verify** button below.\n\n' +
        'By verifying, you agree to follow our server rules.'
      )
      .setColor(0x5865f2)
      .setFooter({ text: 'Click once — verification is instant!' });

    const button = new ButtonBuilder()
      .setCustomId('verify_button')
      .setLabel('✅ Verify Me')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    await verifyChannel.send({ embeds: [embed], components: [row] });

    // Send confirmation then auto-delete after 5 seconds
    await interaction.editReply('✅ Verification system set up! Channel locked, role created, and verify message posted. *(This message will delete itself)*');
    setTimeout(async () => {
      try { await interaction.deleteReply(); } catch (_) {}
    }, 5000);
  }
});

// ─── BUTTON CLICK HANDLER ─────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'verify_button') return;

  const guild  = interaction.guild;
  const member = interaction.member;

  const autoDelete = async (msg) => {
    setTimeout(async () => { try { await msg.delete(); } catch (_) {} }, 5000);
  };

  const verifiedRole = guild.roles.cache.find(r => r.name === VERIFIED_ROLE);
  if (!verifiedRole) {
    await interaction.reply({ content: '⚠️ Verified role not found. Please ask an admin to run `/setup-verify`.', ephemeral: true });
    setTimeout(async () => { try { await interaction.deleteReply(); } catch (_) {} }, 5000);
    return;
  }

  // Already verified?
  if (member.roles.cache.has(verifiedRole.id)) {
    await interaction.reply({ content: '✅ You are already verified!', ephemeral: true });
    setTimeout(async () => { try { await interaction.deleteReply(); } catch (_) {} }, 5000);
    return;
  }

  try {
    await member.roles.add(verifiedRole);
    await interaction.reply({ content: '🎉 You have been verified! You now have access to all channels. Welcome!', ephemeral: true });
    setTimeout(async () => { try { await interaction.deleteReply(); } catch (_) {} }, 5000);
    console.log(`✅ Verified: ${member.user.tag} in ${guild.name}`);
  } catch (err) {
    console.error('Failed to assign role:', err);
    await interaction.reply({ content: '❌ Something went wrong. Make sure the bot role is above the Verified role in Server Settings.', ephemeral: true });
    setTimeout(async () => { try { await interaction.deleteReply(); } catch (_) {} }, 5000);
  }
});

// ─── NEW MEMBER HANDLER ───────────────────────────────────────────────────────
client.on('guildMemberAdd', async member => {
  // DM the new member with instructions
  try {
    await member.send(
      `👋 Welcome to **${member.guild.name}**!\n\n` +
      `Please head to the **#${VERIFY_CHANNEL}** channel and click the **Verify Me** button to access the server.`
    );
  } catch (_) {
    // User may have DMs disabled — that's fine
  }
});

client.login(TOKEN);
