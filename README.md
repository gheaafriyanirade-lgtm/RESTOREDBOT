# ✅ Discord Verify Bot

A simple Discord verification bot. New members land in `#get-verify`, click a button, and instantly gain access to the rest of the server.

---

## 📁 Files
```
verify-bot/
├── index.js        ← Main bot code
├── package.json    ← Dependencies
├── .env.example    ← Copy to .env and fill in your token
└── README.md
```

---

## 🚀 Setup Guide

### Step 1 — Create a Discord Application & Bot
1. Go to https://discord.com/developers/applications
2. Click **New Application** → name it → **Create**
3. Go to the **Bot** tab → click **Add Bot**
4. Under **Token** → click **Reset Token** → copy it
5. Under **Privileged Gateway Intents**, enable:
   - ✅ **Server Members Intent**
   - ✅ **Message Content Intent**
6. Save changes

### Step 2 — Invite the Bot to Your Server
1. Go to **OAuth2 → URL Generator**
2. Check **Scopes**: `bot` + `applications.commands`
3. Check **Bot Permissions**:
   - ✅ Manage Roles
   - ✅ Manage Channels
   - ✅ Send Messages
   - ✅ Read Messages/View Channels
4. Copy the generated URL → paste in browser → invite to your server

### Step 3 — Install & Run
```bash
# 1. Install Node.js from https://nodejs.org (v18+)

# 2. In the verify-bot folder:
npm install

# 3. Copy .env.example to .env
cp .env.example .env

# 4. Open .env and paste your bot token:
#    DISCORD_TOKEN=your_token_here

# 5. Start the bot
npm start
```

### Step 4 — Set Up Your Server
1. In your Discord server, type:
   ```
   /setup-verify
   ```
2. The bot will automatically:
   - Create a `Verified` role
   - Lock all existing channels from unverified users
   - Create (or find) `#get-verify`
   - Post the verify button embed

### Step 5 — Move Bot Role to the Top
> ⚠️ IMPORTANT: The bot can only assign roles that are **below** its own role.

1. Go to **Server Settings → Roles**
2. Drag the bot's role **above** the `Verified` role
3. Save

---

## 🔄 How It Works

```
New member joins
      ↓
Can only see #get-verify
      ↓
Clicks "✅ Verify Me" button
      ↓
Bot assigns "Verified" role
      ↓
Member can now see all channels 🎉
```

---

## ⚙️ Customization

Edit `.env` to change names:
```
VERIFIED_ROLE_NAME=Member        # Change role name
VERIFY_CHANNEL_NAME=verify-here  # Change channel name
```

To change the embed colors/text, edit the embed block in `index.js` around line 95.

---

## 🛠 Troubleshooting

| Problem | Fix |
|---|---|
| Bot can't assign role | Move bot role above Verified in Server Settings → Roles |
| `/setup-verify` not showing | Wait 1-2 min for Discord to register slash commands |
| Channels not locking | Re-run `/setup-verify` after inviting bot |
| Bot offline | Check your token in `.env` is correct |
