/*
  Simple Discord bot for Genesis: BoC. Gets a list of cards & art from the API on GBoC.xyz, and updates when necessary.
  Written by Jarrod Wardell
*/

const { Client, MessagePayload } = require('discord.js');
const conf = require('./main.conf.json');
const network = require('./functions/network.js');
const fs = require('fs');

const token = conf.token;
const prefix = conf.prefix;
const cacheFile = __dirname + "/cardCache.json";

var bot = new Client({ ws: { properties: { $browser: "Discord iOS" }}, intents: ["GUILDS", "GUILD_MESSAGES", "DIRECT_MESSAGES"] });

let releasesCache = ["APH", "BET", "JAE", "RAZ", "J2", "J2 Damjan", "OP1", "KORG", "KORG Alex", "KORG Filip", "KORG Mario", "KORG Raev", "KORG Damjan"];

var lastUpdate = 0;

let cardCache = {};

/*
  Load the current card cache from local file if present; Otherwise, update card cache. Update if the cache is out of date.
*/
function loadCardCache() {
  if (conf.debug) console.log(`## Loading card cache.`);
  if (fs.existsSync(cacheFile)) {
    if (conf.debug) console.log('\x1b[32m%s\x1b[0m', `## Card cache exists.`);
    let data = fs.readFileSync(cacheFile);
    if (data) data = JSON.parse(data);
    if (data && data.lastUpdate && data.cardCache && data.lastUpdate > Date.now() - conf.autoUpdate*1000) {
      lastUpdate = data.lastUpdate;
      cardCache = data.cardCache;
      if (conf.debug) console.log('\x1b[32m%s\x1b[0m', `## Card cache loaded.`);
      return;
    }
  }
  if (conf.debug) console.log('\x1b[33m%s\x1b[0m', `~# Card cache out of date or non-existant.`);
  updateCardCache();
}

/*
  Save the current card cache & last update time to local file.
*/
function saveCardCache() {
  if (conf.debug) console.log(`## Saving card cache.`);
  fs.writeFileSync(cacheFile, JSON.stringify({lastUpdate: lastUpdate, cardCache: cardCache}));
}

/*
  Update the card cache with new data pulled from the API.
*/
async function updateCardCache() {
  lastUpdate = -1;

  let tempCardCache = {};

  let startTime = Date.now();

  if (conf.debug) console.log(`\x07## Getting updated card list.`);

  let cardList = await network.post(conf.API.gateway, conf.API.endpoint, {requests: [{request: 0}]});

  let encodedCardNames = [];

  let cardNames = cardList.responses[0].response;
  for (let card of cardNames) encodedCardNames.push(encodeURIComponent(card));

  if (conf.debug) console.log(`## Getting card list set list.`);
  let cardSetsList = await network.post(conf.API.gateway, conf.API.endpoint, {requests: [{request: 2, card: encodedCardNames}]});

  let cardRuns = cardSetsList.responses[0].response;

  for (let x = 0; x < cardRuns.length; x++) {
    if (cardRuns[x]) {
      let encodedVariantNames = [];
      for (let variant of cardRuns[x]) encodedVariantNames.push(encodeURIComponent(variant));

      if (conf.debug) console.log(`[${(x + 1).toString().padStart(cardRuns.length.toString().length, "0")}/${cardRuns.length}] Getting art list for ${cardNames[x]}`);
      let cardArts = await network.post(conf.API.gateway, conf.API.endpoint, {requests: [{request: 4, card: encodedCardNames[x], variant: encodedVariantNames}]});

      let newCardObj = {};

      let variants = cardArts.responses[0].response;
      if (Array.isArray(variants)) {
        for (let y = 0; y < variants.length; y++) {
          if (variants[y]) {
            newCardObj[cardRuns[x][y]] = variants[y];
          }
        }
      } else {
        if (variants) newCardObj[cardRuns[x][0]] = variants;
      }

      tempCardCache[cardNames[x]] = newCardObj;
    }
  }

  cardCache = JSON.parse(JSON.stringify(tempCardCache));

  lastUpdate = Date.now();
  console.log('\x1b[32m%s\x1b[0m', `## Updated card list in ${Math.round((Date.now() - startTime) / 1000)} seconds.`);

  saveCardCache();
}

bot.on("messageCreate", async message => {
  if (message.author.bot) return;
  if (message.guild && !message.channel.permissionsFor(message.client.user).has(["VIEW_CHANNEL", "SEND_MESSAGES", "EMBED_LINKS", "ATTACH_FILES"])) {
    if (conf.debug) console.log('\x1b[33m%s\x1b[0m', `~ WARNING ~\nPermissions Error\nCould not send message in channel ${message.channel.id} - ${message.channel.name}\nin guild ${message.guild.id} - ${message.guild.name}\nMissing Permissions: ${message.channel.permissionsFor(message.client.user).missing(["VIEW_CHANNEL", "SEND_MESSAGES", "EMBED_LINKS", "ATTACH_FILES"])}\n~ END ~\n`);
    return;
  }
  if (message.content.startsWith(prefix)) {
    let args = message.content.slice(prefix.length).trim().split(/ +/); // remove prefix

    args[0] = args[0].toLowerCase();

    if (args[0] == "update" && conf.admins.includes(message.author.id)) {
      if (conf.debug) console.log('\x1b[33m%s\x1b[0m', `~# Manual card cache update initiated.`);
      updateCardCache();
      message.reply("Updating the card cache.");
    }
    if (args[0] == "card") { // check if command
      if (args[1] && args[1].startsWith("-") ? args[2] || true : true) {
        /*if (lastUpdate === -1) { // card cache updating, might not have all cards loaded
          message.reply("Currently updating the card cache, please try again in a minute.");
          return;
        }*/

        let run = args[1].startsWith("-") && (args[2] || true) ? args[1].replace("-", "").toUpperCase() : false;
        let searchTerm = message.content.replace(prefix + args[0] + " " + (run ? args[1] : ""), "");
        searchTerm = cleanseInput(searchTerm);
        if (run) searchTerm = searchTerm.replace(" ", "");
        let cards = [];

        for (let card in cardCache) {
          if ((run && !args[2]) || cleanseInput(card).includes(searchTerm) || cleanseInput(card) === searchTerm) {
            if (run) {
              for (let variant in cardCache[card]) {
                if (variant.toUpperCase().includes(run)) {
                  cards.push([card, variant]);
                  break;
                }
              }
            } else {
              let tempRun = false;
              for (let x = releasesCache.length - 1; x >= 0; x--) {
                if (cardCache[card][releasesCache[x]]) {
                  tempRun = releasesCache[x];
                  break;
                }
              }
              if (!tempRun) tempRun = Object.keys(cardCache[card])[0]
              cards.push([card, tempRun]);
            }
          }
          if (card.toLowerCase().trim() === searchTerm.toLowerCase().trim()) {
            let toHold = cards[cards.length - 1];
            cards = [toHold];
            break;
          }
        }

        if (cards.length == 1) {
          if (conf.debug) console.log(`${cards[0][0].padStart(30)} - ${cards[0][1]}\n${cardCache[cards[0][0]][cards[0][1]]}\n`);
          message.channel.send({embeds: [{title: cards[0][0], image: {url: cardCache[cards[0][0]][cards[0][1]]}, url: "https://gboc.xyz/gallery", footer: {text: "Data from gboc.xyz"}}]});
        } else {
          let replyString = "Cards matching that term:";
          if (cards.length > 20) {
            replyString = "Too many cards matching that term! Try being more specific.";
          } else if (cards.length == 0) {
            replyString = "No cards matching that term! Try something else.";
            if (conf.debug) console.log('\x1b[93m%s\x1b[0m', `${searchTerm.padStart(30)} - No Match Found\n`);
          } else {
            for (let card of cards) {
              replyString += `\n${card[0]}`;
            }
          }
          message.reply(replyString);
        }
      } else {
        message.reply("Please provide a search term.")
      }

      if (lastUpdate != -1 && lastUpdate < Date.now() - conf.autoUpdate*1000) { // card cache out of date
        updateCardCache();
      }
    } else if (args[0] == "help") {
      message.reply(`To search for a card, type \`${prefix}card [-set] card name\`\nSet is optional, but must be preceded by a dash and relates to the set code seen in the circle on the card.  If not provided, the default is the most recent release of the card.\nEx. \`${prefix}card bar\` - Search for cards with "bar" in the name.\nEx. \`${prefix}card barruk\` - Search for and display most recent Barruk\nEx. \`${prefix}card -aph Barruk\` - Search for and display Alpha Barruk`)
    } else if (args[0] == "ping") {
      message.reply("Pong!");
    }
  }
});

function cleanseInput(text) {
  return text.toLowerCase().replaceAll("‘", "'").replaceAll("’", "'").replaceAll("“", '"').replaceAll("”", '"').replaceAll('á', 'a').trim()
}

bot.on("ready", async evt => {
  console.log('\x07\x1b[36m%s\x1b[0m', "## Ready!");

  bot.user.setPresence({
    activities: [
      {
        name: 'the Arena',
        type: 'COMPETING'
      }
    ],
    status: 'online'
    });
});

loadCardCache();
bot.login(token);
