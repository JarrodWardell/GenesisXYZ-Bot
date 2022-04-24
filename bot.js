/*
  Simple Discord bot for Genesis: BoC. Gets a list of cards & art from the API on GBoC.xyz, and updates when necessary.
  Written by Jarrod Wardell
*/

const { Client, MessagePayload } = require('discord.js');
const conf = require('./main.conf.json');
const network = require('./functions/network.js');

const token = conf.token;
const prefix = conf.prefix;

var bot = new Client({ ws: { properties: { $browser: "Discord iOS" }}, intents: ["GUILDS", "GUILD_MESSAGES", "DIRECT_MESSAGES"] });

let releasesCache = ["APH", "BET", "JAE", "RAZ", "J2", "J2 Damjan", "OP1"];

var lastUpdate = 0;

let cardCache = {};

/*
  Update the card cache with new data pulled from the API.
*/
async function updateCards() {
  lastUpdate = -1;

  let startTime = Date.now();

  if (conf.debug) console.log(`Getting updated card list.`);

  let cardList = await network.post(conf.API.gateway, conf.API.endpoint, {requests: [{request: 0}]});

  let encodedCardNames = [];

  let cardNames = cardList.responses[0].response;
  for (let card of cardNames) encodedCardNames.push(encodeURIComponent(card));

  if (conf.debug) console.log(`Getting card list set list.`);
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

      cardCache[cardNames[x]] = newCardObj;
    }
  }

  lastUpdate = Date.now();
  console.log(`Updated card list in ${Math.round((Date.now() - startTime) / 1000)} seconds.`);
}

bot.on("messageCreate", async message => {
  if (message.author.bot) return;
  if (message.content.startsWith(prefix)) {
    let args = message.content.slice(prefix.length).trim().split(/ +/); // remove prefix

    args[0] = args[0].toLowerCase();

    if (args[0] == "update" && conf.admins.includes(message.author.id)) {
      updateCards();
      message.reply("Updating the card cache.");
    }
    if (args[0] == "card") { // check if command
      if (args[1] && args[1].startsWith("-") ? args[2] : true) {
        if (lastUpdate === -1) { // card cache updating, might not have all cards loaded
          message.reply("Currently updating the card cache, please try again in a minute.");
          return;
        }

        let run = args[1].startsWith("-") && args[2] ? args[1].replace("-", "").toUpperCase() : false;
        let searchTerm = message.content.replace(prefix + args[0] + " " + (run ? args[1] + " " : ""), "");
        let cards = [];

        for (let card in cardCache) {
          if (card.toLowerCase().includes(searchTerm.toLowerCase())) {
            if (run) {
              for (let variant in cardCache[card]) {
                if (variant.includes(run)) {
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
        }
        if (cards.length == 1) {
          if (conf.debug) console.log(`${cards[0][0]} - ${cards[0][1]} - ${cardCache[cards[0][0]][cards[0][1]]}`);
          message.channel.send({embeds: [{title: cards[0][0], image: {url: cardCache[cards[0][0]][cards[0][1]]}, url: "https://gboc.xyz/gallery", footer: {text: "Data from gboc.xyz"}}]});
        } else {
          let replyString = "Cards matching that term:";
          if (cards.length > 10) {
            replyString = "Too many cards matching that term! Try being more specific.";
          } else if (cards.length == 0) {
            replyString = "No cards matching that term! Try something else.";
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

      if (lastUpdate < Date.now() - conf.autoUpdate*1000) { // card cache out of date
        updateCards();
      }
    } else if (args[0] == "help") {
      message.reply(`To search for a card, type \`${prefix}card [-set] card name\`\nSet is optional, but must be preceded by a dash and relates to the set code seen in the circle on the card.  If not provided, the default is the most recent release of the card.\nEx. \`${prefix}card bar\` - Search for cards with "bar" in the name.\nEx. \`${prefix}card barruk\` - Search for and display most recent Barruk\nEx. \`${prefix}card -aph Barruk\` - Search for and display Alpha Barruk`)
    } else if (args[0] == "ping") {
      message.reply("Pong!");
    }
  }
});

bot.on("ready", async evt => {
  console.log("Ready!");

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

updateCards();
bot.login(token);
